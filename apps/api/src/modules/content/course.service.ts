import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourseCreateInput, CourseUpdateInput, CourseStatus } from '@ayman/contracts/content';
import { EXAM_SECTION_TITLE } from '@ayman/contracts/content';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { Course } from '../../generated/prisma/client';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      select: { systemId: true, year: true, trackId: true, subjectId: true },
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

    try {
      const course = await this.prisma.course.update({
        where: { id },
        // Explicit field list. `status`, `publishedAt`, `instructorId` and
        // `position` are structurally unreachable from here.
        data: {
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.coverKey !== undefined && { coverKey: input.coverKey }),
          ...(input.forGeneral !== undefined && { forGeneral: input.forGeneral }),
          ...(input.forLanguages !== undefined && { forLanguages: input.forLanguages }),
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
        where: { courseId: id, isPublished: true, section: { isPublished: true } },
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
        publishedAt: status === 'published' ? (course.publishedAt ?? new Date()) : course.publishedAt,
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
        return { quizId: existing.id, lessonId: course.examLessonId, created: false };
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

      await tx.course.update({ where: { id: courseId }, data: { examLessonId: lesson.id } });

      return { quizId: quiz.id, lessonId: lesson.id };
    });

    await this.audit.record({
      action: 'course:update',
      resourceType: AUDIT_RESOURCES.course,
      resourceId: courseId,
      outcome: 'success',
      metadata: { operation: 'scaffoldExam', lessonId: result.lessonId, quizId: result.quizId },
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
    const course = await this.prisma.course.findUnique({ where: { id }, select: { status: true } });
    if (!course) throw new NotFoundException();

    const attemptCount = await this.prisma.quizAttempt.count({
      where: { quiz: { lesson: { courseId: id } } },
    });
    if (attemptCount > 0) {
      throw new ConflictException({
        code: 'course_has_attempts',
        message: 'this course has student quiz attempts and can never be hard-deleted; archive it instead',
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
        status: true,
        year: true,
        publishedAt: true,
        updatedAt: true,
        system: { select: { nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        _count: { select: { lessons: true } },
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
        status: true,
        examLessonId: true,
        publishedAt: true,
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            summary: true,
            position: true,
            isPublished: true,
            lessons: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                position: true,
                isPublished: true,
                isFreePreview: true,
                estimatedSeconds: true,
                video: { select: { externalId: true, durationSeconds: true } },
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
                  select: { id: true, isPublished: true, _count: { select: { slots: true } } },
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
