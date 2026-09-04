import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CourseCreateInput,
  CourseUpdateInput,
  CourseStatus,
  CourseVideoCheck,
  LessonKind,
  PublishAllResult,
} from '@ayman/contracts/content';
import { EXAM_SECTION_TITLE } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import { YouTubeDurationService } from './youtube-duration.service';
import type { Course } from '../../generated/prisma/client';

/** Just enough of a lesson to decide whether a student could study it. */
type ReadinessRow = {
  kind: LessonKind;
  video: unknown | null;
  text: unknown | null;
  quiz: { isPublished: boolean } | null;
  _count: { resources: number };
};

/**
 * Can a student actually do this lesson?
 *
 * Publishing is otherwise free to produce a lecture that opens onto a blank
 * 16/9 space, a reading with no text, or an exam with no questions — each of
 * which reaches the student as a broken page rather than as an absent one.
 */
function lessonIsReady(lesson: ReadinessRow): boolean {
  if (lesson.kind === 'video') return lesson.video !== null;
  if (lesson.kind === 'text') return lesson.text !== null;
  if (lesson.kind === 'attachment') return lesson._count.resources > 0;
  // A quiz lesson needs its quiz PUBLISHED, not merely present: publishing a
  // quiz runs its own validation (every pool can fill its pickCount, marks sum
  // above zero), and this must not be a way around that.
  return lesson.quiz?.isPublished === true;
}

function reasonFor(kind: LessonKind): PublishAllResult['skipped'][number]['reason'] {
  if (kind === 'video') return 'noVideo';
  if (kind === 'text') return 'noText';
  if (kind === 'attachment') return 'noResources';
  return 'quizNotPublished';
}

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly youtube: YouTubeDurationService,
  ) {}

  /**
   * S10-equivalent: re-validate the taxonomy tuple against the DATABASE, not
   * just the Zod schema. A client can submit four syntactically valid UUIDs
   * that name a subject belonging to another system — Zod cannot know that and
   * the foreign keys individually cannot either, because each id exists.
   */
  private async assertOfferingExists(input: {
    systemId: string;
    year: number;
    trackId: string | null;
    subjectId: string;
  }): Promise<void> {
    if (input.year === 1 && input.trackId !== null) {
      throw new BadRequestException('grade 1 courses cannot carry a track');
    }
    const offering = await this.prisma.subjectOffering.findFirst({
      where: {
        systemId: input.systemId,
        year: input.year,
        trackId: input.trackId,
        subjectId: input.subjectId,
      },
      select: { id: true },
    });
    if (!offering) {
      throw new BadRequestException(
        'no subject offering exists for this (system, year, track, subject)',
      );
    }
  }

  async create(actorId: string, input: CourseCreateInput): Promise<Course> {
    await this.assertOfferingExists(input);

    // Named fields only. Never `data: input` — a spread is how a field that was
    // added to the schema for internal use ends up client-writable six months
    // later without anyone noticing.
    try {
      const course = await this.prisma.course.create({
        data: {
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle,
          description: input.description,
          systemId: input.systemId,
          year: input.year,
          trackId: input.trackId,
          subjectId: input.subjectId,
          coverKey: input.coverKey,
          requiresGrant: input.requiresGrant,
          emphasis: input.emphasis,
          emphasisNote: input.emphasisNote,
          comingSoonNote: input.comingSoonNote,
          contentComplete: input.contentComplete,
          monthlyPriceCents: input.monthlyPriceCents,
          quarterlyPriceCents: input.quarterlyPriceCents,
          yearlyPriceCents: input.yearlyPriceCents,
          bookTitle: input.bookTitle,
          bookPriceCents: input.bookPriceCents,
          forGeneral: input.forGeneral,
          forLanguages: input.forLanguages,
          instructorId: actorId,
          status: 'draft',
        },
      });
      await this.audit.record({
        action: 'course:create',
        resourceType: AUDIT_RESOURCES.course,
        resourceId: course.id,
        outcome: 'success',
        metadata: { slug: course.slug, title: course.title },
      });
      return course;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('slug already in use');
      throw error;
    }
  }

  async update(id: string, input: CourseUpdateInput): Promise<Course> {
    const current = await this.prisma.course.findUnique({
      where: { id },
      select: {
        systemId: true,
        year: true,
        trackId: true,
        subjectId: true,
        requiresGrant: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        bookTitle: true,
        bookPriceCents: true,
      },
    });
    if (!current) throw new NotFoundException();

    // Any change to the taxonomy tuple re-validates the WHOLE tuple, because
    // changing one component can invalidate a combination that was previously
    // legal.
    const next = {
      systemId: input.systemId ?? current.systemId,
      year: input.year ?? current.year,
      trackId: input.trackId === undefined ? current.trackId : input.trackId,
      subjectId: input.subjectId ?? current.subjectId,
    };
    await this.assertOfferingExists(next);

    /*
     * Mirrors `courses_priced_requires_grant`, resolved against the CURRENT
     * row rather than the bare patch — see the note next to
     * `CourseUpdateSchema` in `content.ts` for why the contract layer cannot
     * do this itself on a partial patch.
     */
    const nextMonthly = input.monthlyPriceCents === undefined ? current.monthlyPriceCents : input.monthlyPriceCents;
    const nextQuarterly = input.quarterlyPriceCents === undefined ? current.quarterlyPriceCents : input.quarterlyPriceCents;
    const nextYearly = input.yearlyPriceCents === undefined ? current.yearlyPriceCents : input.yearlyPriceCents;
    const willBePriced = nextMonthly != null || nextQuarterly != null || nextYearly != null;

    let requiresGrantWrite = input.requiresGrant;
    if (willBePriced) {
      if (input.requiresGrant === false) {
        throw new BadRequestException('لازم تشيل كل الأسعار الأول قبل ما تفتح الكورس ده مجاني للكل');
      }
      // A price change with no explicit `requiresGrant` in the same patch
      // auto-closes the course — the admin priced it, that IS the decision.
      if (input.requiresGrant === undefined && !current.requiresGrant) {
        requiresGrantWrite = true;
      }
    }

    /*
     * Mirrors `courses_book_needs_price_and_title`, resolved against the
     * CURRENT row for the same reason `nextMonthly`/etc are above — see the
     * note next to `CourseUpdateSchema` in `content.ts`.
     */
    const nextBookTitle = input.bookTitle === undefined ? current.bookTitle : input.bookTitle;
    const nextBookPriceCents =
      input.bookPriceCents === undefined ? current.bookPriceCents : input.bookPriceCents;
    if ((nextBookTitle === null) !== (nextBookPriceCents === null)) {
      throw new BadRequestException('الكتاب محتاج اسم وسعر مع بعض');
    }

    try {
      const course = await this.prisma.course.update({
        where: { id },
        // Explicit field list. `status`, `publishedAt`, `instructorId` and
        // `position` are structurally unreachable from here.
        data: {
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.coverKey !== undefined && { coverKey: input.coverKey }),
          ...(requiresGrantWrite !== undefined && {
            requiresGrant: requiresGrantWrite,
          }),
          ...(input.emphasis !== undefined && { emphasis: input.emphasis }),
          ...(input.emphasisNote !== undefined && {
            emphasisNote: input.emphasisNote,
          }),
          ...(input.comingSoonNote !== undefined && {
            comingSoonNote: input.comingSoonNote,
          }),
          ...(input.contentComplete !== undefined && {
            contentComplete: input.contentComplete,
          }),
          ...(input.monthlyPriceCents !== undefined && {
            monthlyPriceCents: input.monthlyPriceCents,
          }),
          ...(input.quarterlyPriceCents !== undefined && {
            quarterlyPriceCents: input.quarterlyPriceCents,
          }),
          ...(input.yearlyPriceCents !== undefined && {
            yearlyPriceCents: input.yearlyPriceCents,
          }),
          ...(input.bookTitle !== undefined && { bookTitle: input.bookTitle }),
          ...(input.bookPriceCents !== undefined && {
            bookPriceCents: input.bookPriceCents,
          }),
          ...(input.forGeneral !== undefined && {
            forGeneral: input.forGeneral,
          }),
          ...(input.forLanguages !== undefined && {
            forLanguages: input.forLanguages,
          }),
          systemId: next.systemId,
          year: next.year,
          trackId: next.trackId,
          subjectId: next.subjectId,
        },
      });
      await this.audit.record({
        action: 'course:update',
        resourceType: AUDIT_RESOURCES.course,
        resourceId: id,
        outcome: 'success',
        metadata: { changed: Object.keys(input) },
      });
      return course;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('slug already in use');
      throw error;
    }
  }

  /**
   * The only writer of `status`. Publishing an empty course is the most common
   * way a catalog page ships broken, so it is refused here rather than caught
   * in review.
   */
  async setStatus(id: string, status: CourseStatus): Promise<Course> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    });
    if (!course) throw new NotFoundException();

    if (status === 'published') {
      const publishedLessons = await this.prisma.lesson.count({
        where: {
          courseId: id,
          isPublished: true,
          section: { isPublished: true },
        },
      });
      if (publishedLessons === 0) {
        throw new BadRequestException('a course needs at least one published lesson to go live');
      }
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        status,
        // Set once. `publishedAt` is the course's birthday, not its last
        // deploy — the sitemap's <lastmod> uses updatedAt for that.
        publishedAt:
          status === 'published' ? (course.publishedAt ?? new Date()) : course.publishedAt,
      },
    });

    await this.audit.record({
      action: status === 'published' ? 'course:publish' : 'course:unpublish',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: id,
      outcome: 'success',
      metadata: { status },
    });

    return updated;
  }

  /**
   * Ask YouTube about EVERY video in the course, and report only the ones a
   * student would have trouble with.
   *
   * ## Why this exists as its own operation
   *
   * The per-lecture check answers the question at the moment a link is pasted,
   * which is the right moment for a lecture being written — and no help at all
   * for a course that is already live. A video can be fine on the day it is
   * saved and private a month later: the owner makes it unlisted while
   * re-editing, or YouTube age-restricts it, and nothing on the platform
   * notices. The first report is «الفيديو مش متاح» from a student, and finding
   * WHICH lecture then means opening every one of them in turn.
   *
   * One press, every video, and the broken ones by name.
   *
   * ## Sequential, not `Promise.all`
   *
   * Forty lectures would be forty simultaneous requests to youtube.com from one
   * datacenter IP, which is how a scraper gets throttled and starts answering
   * `unknown` for everything — turning a useful report into a page of shrugs.
   * In series it is slower and it is right: the caller is a human who pressed a
   * button and will wait a moment for an answer they can trust. `probe` carries
   * its own 8s timeout, so one hanging video cannot stall the rest.
   *
   * ## What counts as a problem
   *
   * Anything except `ok`, plus a video lecture with no video row at all. An
   * `unknown` IS reported: "we could not find out" is worth a glance, and
   * silently treating it as fine is the exact failure the embed check exists to
   * end. The all-clear is an empty list.
   */
  async checkVideos(id: string): Promise<CourseVideoCheck> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            title: true,
            lessons: {
              where: { kind: 'video' },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                isPublished: true,
                video: { select: { externalId: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();

    const problems: CourseVideoCheck['problems'] = [];
    let checked = 0;

    for (const section of course.sections) {
      for (const lesson of section.lessons) {
        checked += 1;
        const externalId = lesson.video?.externalId ?? null;

        if (externalId === null) {
          problems.push({
            lessonId: lesson.id,
            title: lesson.title,
            sectionTitle: section.title,
            isPublished: lesson.isPublished,
            externalId: null,
            // Nothing was asked of YouTube, so there is no answer to report.
            // `null` says that, where `unknown` would claim we had tried.
            embed: null,
          });
          continue;
        }

        const { embed } = await this.youtube.probe(externalId);
        if (embed === 'ok') continue;
        problems.push({
          lessonId: lesson.id,
          title: lesson.title,
          sectionTitle: section.title,
          isPublished: lesson.isPublished,
          externalId,
          embed,
        });
      }
    }

    return { checked, problems };
  }

  /**
   * Publish the course AND everything in it that is ready — the "one button"
   * the editor offers instead of a publish toggle per course, per section and
   * per lesson.
   *
   * ## Why a cascade at all
   *
   * Publishing is FOUR independent flags: `Course.status`, `CourseSection
   * .isPublished`, `Lesson.isPublished`, and a quiz lesson's own
   * `Quiz.isPublished`. An instructor who had finished a course had to find and
   * press every one of them, in the right order, or the course went live
   * showing nothing — «في كلمة واحدة بس، إن أنا لو عملته يبقى أضاف». The
   * per-row toggles stay for the thing they are genuinely good at, which is
   * hiding ONE lecture; this serves the case that had no control at all.
   *
   * ## Ready, not everything
   *
   * A lesson is published here only if a student could actually do it — see
   * `lessonIsReady`. Anything unready is LEFT ALONE and named in the result, so
   * «ليه المحاضرة دي مش ظاهرة للطلبة؟» is answered on screen instead of in a
   * support message. That is also what makes this safe to press on a
   * half-finished course, which is exactly the state «حتى لو ما كملتش»
   * describes: the finished lectures go live, the unfinished ones stay drafts.
   *
   * A section publishes when it will END UP with at least one published lesson.
   * An empty published section is a heading a student can see and cannot open.
   *
   * ## What it never does
   *
   * It does not unpublish anything. A lesson that is already live but has since
   * lost its video is left published and is not reported as skipped — hiding a
   * lecture students are part-way through is not a thing a «نشر» button should
   * do quietly.
   */
  async publishAll(id: string): Promise<PublishAllResult> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        publishedAt: true,
        sections: {
          select: {
            id: true,
            isPublished: true,
            lessons: {
              select: {
                id: true,
                title: true,
                kind: true,
                isPublished: true,
                video: { select: { lessonId: true } },
                text: { select: { lessonId: true } },
                quiz: { select: { isPublished: true } },
                _count: { select: { resources: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();

    const lessonIds: string[] = [];
    const sectionIds: string[] = [];
    const skipped: PublishAllResult['skipped'] = [];
    /** Whether anything at all will be visible when this finishes. */
    let anyVisible = false;

    for (const section of course.sections) {
      const ready = section.lessons.filter(lessonIsReady);
      for (const lesson of section.lessons) {
        if (lessonIsReady(lesson) || lesson.isPublished) continue;
        skipped.push({
          id: lesson.id,
          title: lesson.title,
          reason: reasonFor(lesson.kind),
        });
      }

      const visibleHere = ready.length > 0 || section.lessons.some((lesson) => lesson.isPublished);
      if (visibleHere) {
        anyVisible = true;
        if (!section.isPublished) sectionIds.push(section.id);
      }
      lessonIds.push(...ready.filter((lesson) => !lesson.isPublished).map((lesson) => lesson.id));
    }

    if (!anyVisible) {
      // `setStatus` refuses this too, with a bare English sentence. Saying it
      // here in Arabic means the instructor gets the reason and not a 400.
      throw new BadRequestException(copy.admin.course.publishBlocked);
    }

    // ONE transaction. A cascade that publishes the lessons and then fails on
    // the course leaves the three levels disagreeing — which is precisely the
    // state this method exists to make unreachable.
    await this.prisma.$transaction([
      this.prisma.lesson.updateMany({
        where: { id: { in: lessonIds } },
        data: { isPublished: true },
      }),
      this.prisma.courseSection.updateMany({
        where: { id: { in: sectionIds } },
        data: { isPublished: true },
      }),
      this.prisma.course.update({
        where: { id },
        data: {
          status: 'published',
          // Set once — the course's birthday, not its last deploy. Same rule
          // as `setStatus`, and the DB CHECK requires it to be non-null.
          publishedAt: course.publishedAt ?? new Date(),
        },
      }),
    ]);

    await this.audit.record({
      action: 'course:publish',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: id,
      outcome: 'success',
      metadata: {
        status: 'published',
        cascade: true,
        lessons: lessonIds.length,
        sections: sectionIds.length,
        skipped: skipped.length,
      },
    });

    return {
      publishedLessons: lessonIds.length,
      publishedSections: sectionIds.length,
      skipped,
    };
  }

  /**
   * Designates one of the course's own `quiz` lessons as its final exam, or
   * clears the designation with `null`.
   *
   * Both checks below are also enforced by the database — `kind` by this
   * method alone, but "belongs to this course" by the composite FK
   * `courses_exam_lesson_in_same_course`, which is what survives a direct SQL
   * write. This exists so an admin gets a sentence instead of a constraint
   * violation.
   *
   * The lesson does NOT have to be published or have a built quiz yet: an exam
   * is designated while the course is still being authored, and requiring
   * publication here would mean the admin could never set it before going
   * live. The progression gate reads published state at request time.
   */
  async setExamLesson(courseId: string, lessonId: string | null): Promise<Course> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException();

    if (lessonId !== null) {
      // Scoped to the course in the WHERE clause, not fetched-then-checked: a
      // lesson id from another course finds no row and 400s, and never reveals
      // through a distinct error that it exists.
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: lessonId, courseId },
        select: { kind: true },
      });
      if (!lesson) {
        throw new BadRequestException('the exam lesson must belong to this course');
      }
      if (lesson.kind !== 'quiz') {
        throw new BadRequestException('the exam lesson must be a quiz lesson');
      }
    }

    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: { examLessonId: lessonId },
    });

    await this.audit.record({
      action: 'course:update',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: courseId,
      outcome: 'success',
      metadata: { operation: 'setExamLesson', examLessonId: lessonId },
    });

    return updated;
  }

  /**
   * Builds the course's final exam — section, lesson, quiz and pointer — in one
   * transaction, and hands back the existing one untouched if there already is
   * one.
   *
   * ## Why it exists
   *
   * Creating an exam by hand took five steps across three pages: add a
   * section, add a `quiz` lesson, follow its link (which lazily creates the
   * quiz), build the questions, come back and pick the lesson in a dropdown.
   *
   * The fourth step is where it silently went wrong. The lazy-create path in
   * `admin/quizzes/lesson/[lessonId]` builds a PRACTICE quiz — unlimited
   * attempts, correctness shown during the attempt. That is right for a lesson
   * quiz and completely wrong for a final exam, and nothing anywhere told the
   * instructor to change it. This creates it graded from the start.
   *
   * ## Idempotent by early return, not by constraint
   *
   * `courses.exam_lesson_id` is `@unique` and the composite FK
   * `courses_exam_lesson_in_same_course` already makes a cross-course pointer
   * impossible. Neither stops a second press from creating a second orphan
   * section and lesson that no course points at. The early return is what
   * does, and `scaffoldExam` is covered by a test that presses twice and
   * counts rows.
   *
   * ## Everything unpublished
   *
   * The exam becomes visible through the same publish toggles as any other
   * content, so there is one publishing story rather than two. It is also why
   * this needs no `course:publish` — it puts nothing in front of a student.
   *
   * ## No position games
   *
   * The progression gate (`gate-rule.ts`) opens the exam only when every OTHER
   * published lesson is cleared, wherever it sits. So the exam does not need a
   * position, a flag, or a branch — only to be an ordinary lesson somewhere.
   * Its own section is presentation, and it keeps the outline readable.
   */
  async scaffoldExam(
    courseId: string,
  ): Promise<{ quizId: string; lessonId: string; created: boolean }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, examLessonId: true },
    });
    if (!course) throw new NotFoundException();

    if (course.examLessonId !== null) {
      const existing = await this.prisma.quiz.findUnique({
        where: { lessonId: course.examLessonId },
        select: { id: true },
      });
      if (existing) {
        return {
          quizId: existing.id,
          lessonId: course.examLessonId,
          created: false,
        };
      }
      // A designated exam lesson with no quiz row is legal: an instructor can
      // promote a hand-made quiz lesson through `setExamLesson` before ever
      // opening the builder. Give it the quiz it is missing — and do NOT
      // invent a second section for a lesson that already has one.
      const quiz = await this.prisma.quiz.create({
        data: {
          lessonId: course.examLessonId,
          // The final exam is the one quiz that offers a second sitting. Its
          // improvement paper starts empty and the publish guard refuses to
          // ship it that way, which is what turns "an exam was scaffolded"
          // into "an instructor must actually build the second paper".
          allowsImprovement: true,
          shuffleQuestions: true,
          reviewOptions: DEFAULT_REVIEW_OPTIONS,
          isPublished: false,
        },
        select: { id: true },
      });
      return { quizId: quiz.id, lessonId: course.examLessonId, created: true };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const last = await tx.courseSection.findFirst({
        where: { courseId },
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
        select: { position: true },
      });

      const section = await tx.courseSection.create({
        data: {
          courseId,
          title: EXAM_SECTION_TITLE,
          summary: null,
          isPublished: false,
          position: last === null ? 0 : last.position + 1,
        },
        select: { id: true },
      });

      const lesson = await tx.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: EXAM_SECTION_TITLE,
          kind: 'quiz',
          position: 0,
          isPublished: false,
        },
        select: { id: true },
      });

      const quiz = await tx.quiz.create({
        data: {
          lessonId: lesson.id,
          allowsImprovement: true,
          shuffleQuestions: true,
          reviewOptions: DEFAULT_REVIEW_OPTIONS,
          isPublished: false,
        },
        select: { id: true },
      });

      await tx.course.update({
        where: { id: courseId },
        data: { examLessonId: lesson.id },
      });

      return { quizId: quiz.id, lessonId: lesson.id };
    });

    await this.audit.record({
      action: 'course:update',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: courseId,
      outcome: 'success',
      metadata: {
        operation: 'scaffoldExam',
        lessonId: result.lessonId,
        quizId: result.quizId,
      },
    });

    return { ...result, created: true };
  }

  /**
   * I4 (audit): a course's lessons cascade to quizzes, which cascade to
   * quiz_attempts, which cascade to attempt_events — and attempt_events is
   * append-only (a DB trigger REVOKEs the DELETE/UPDATE outright, even for
   * the table owner). A `course.delete()` against a course with any student
   * attempt therefore always rolled the whole transaction back with a raw
   * Postgres error surfacing as an opaque 500, permanently. That trigger is
   * correct — a student's attempt history is an audit trail, not something a
   * course deletion should ever cascade through — so the fix is here, not
   * there: check for attempts BEFORE Prisma ever issues the cascading
   * DELETE, and refuse with a specific, actionable error instead of letting
   * the DB reject it. `archived` (already a distinct CourseStatus from
   * `draft` — see the enum) is the "right action" this refusal points the
   * admin at: retiring a finished course is a different intent from an
   * instructor unpublishing a work-in-progress back to `draft`, and the
   * catalog (`status: 'published'` exact-match) already excludes both.
   */
  async remove(id: string): Promise<{ id: string }> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!course) throw new NotFoundException();

    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lesson: { courseId: id } } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'course_has_attempts',
        message:
          'this course has student quiz attempts and can never be hard-deleted; archive it instead',
      });
    }

    if (course.status === 'published') {
      throw new BadRequestException('unpublish before deleting');
    }
    await this.prisma.course.delete({ where: { id } });
    await this.audit.record({
      action: 'course:delete',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: id,
      outcome: 'success',
      metadata: null,
    });
    return { id };
  }

  list() {
    return this.prisma.course.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        status: true,
        year: true,
        // The admin list renders as a grid of cards, so it needs the same
        // artwork the student's card carries — otherwise every tile falls back
        // to the generated scene and two covers that were actually uploaded
        // are invisible to the person who uploaded them.
        coverKey: true,
        // The admin list is where the student page finds which courses are
        // closed, so it can offer only those — see `CourseAccessSection`.
        requiresGrant: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        // مدارس عام / مدارس لغات.
        //
        // Not for the grid — the admin cards do not draw a stream badge. This
        // is for the COURSE PICKERS that read this list, the book editor's
        // «الكورس المرتبط» first among them: a picker that offers «الرياضيات
        // — أولى بكالوريا» twice, once for عام and once for لغات, with no way
        // to tell the two apart is a picker whose options are indistinguishable
        // by the only fact that separates them. `books.course_id` is UNIQUE, so
        // picking the wrong one of that pair is not a mistake the admin gets to
        // correct by adding a second row — they have to find and unlink the
        // first. The label is what prevents that, and it costs two booleans on
        // a query the list already runs.
        forGeneral: true,
        forLanguages: true,
        // «أضف طلب كتاب» — the admin manual book-order form's own course
        // picker finds its choices here (only courses with both set), same
        // reasoning as the priced-plan fields above.
        bookTitle: true,
        bookPriceCents: true,
        publishedAt: true,
        updatedAt: true,
        system: { select: { nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        _count: { select: { lessons: true } },
        // The admin student page's own manual-subscribe term option finds
        // its choices here — see `SubscriptionSection`'s own doc.
        terms: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, isOpen: true, priceCents: true },
        },
      },
    });
  }

  async findForAdmin(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        systemId: true,
        year: true,
        trackId: true,
        subjectId: true,
        coverKey: true,
        requiresGrant: true,
        emphasis: true,
        emphasisNote: true,
        comingSoonNote: true,
        contentComplete: true,
        monthlyPriceCents: true,
        quarterlyPriceCents: true,
        yearlyPriceCents: true,
        bookTitle: true,
        bookPriceCents: true,
        forGeneral: true,
        forLanguages: true,
        status: true,
        examLessonId: true,
        publishedAt: true,
        // الترم الأول / الترم الثاني — the editor's own term panel renders
        // straight from this, no separate list endpoint.
        terms: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, position: true, isOpen: true, priceCents: true },
        },
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            summary: true,
            position: true,
            isPublished: true,
            termId: true,
            lessons: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                position: true,
                isPublished: true,
                isFreePreview: true,
                forGeneral: true,
                forLanguages: true,
                estimatedSeconds: true,
                // The completion rule. `LessonSettingsForm` has existed and
                // been unit-tested since it shipped but could never be
                // rendered, because the payload it reads did not carry these
                // three — the same shape of omission as `text` above.
                completionMode: true,
                completionMinViewSeconds: true,
                completionPassGrade: true,
                video: {
                  select: {
                    externalId: true,
                    durationSeconds: true,
                    posterKey: true,
                  },
                },
                // The editor prefills its textarea from this. Without it the
                // field renders EMPTY over an existing body, and the
                // instructor writes into what looks like a blank lesson —
                // overwriting content they were never shown.
                text: { select: { bodyHtml: true } },
                // Drives the delete confirmation's consequence line.
                //
                // A row count IS a student count here, with no DISTINCT:
                // lesson_progress is keyed @@id([enrollmentId, lessonId]) and
                // an enrollment is one per user per course, so one lesson can
                // never hold two rows for the same student.
                _count: { select: { progress: true } },
                // The quiz's SHAPE, never its questions. `slots` is what lets
                // the outline say "this exam has no questions yet" without a
                // second round trip — and without putting a single answer key
                // into an admin list payload.
                quiz: {
                  select: {
                    id: true,
                    isPublished: true,
                    _count: { select: { slots: true } },
                  },
                },
                // The admin's materials panel renders from these. An explicit
                // select, never an include — `storageKey` stays out of the
                // response, because the admin UI has no use for it and a key
                // in a payload is a key that can leak.
                resources: {
                  orderBy: [{ position: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    kind: true,
                    title: true,
                    description: true,
                    filename: true,
                    linkUrl: true,
                    videoExternalId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();
    return course;
  }
}
