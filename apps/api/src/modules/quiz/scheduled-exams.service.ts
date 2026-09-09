import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EXAM_SHELF_TITLE, examPhase } from '@ayman/contracts/quiz/scheduled';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import type { StudentExams } from '@ayman/contracts/quiz/scheduled';
import type {
  AdminExamCreateInput,
  AdminExamDuplicateInput,
  AdminExamList,
  AdminExamPatchInput,
  ExamLessonPicker,
} from '@ayman/contracts/admin/exams';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { GRADED_STATES } from './analytics.service';

type TransactionClient = Prisma.TransactionClient;

/**
 * امتحانات نص/آخر الشهر.
 *
 * ## What this service is, and what it deliberately is not
 *
 * It is a THIN authoring layer over the quiz engine. It creates a section, a
 * lesson and a quiz, and it writes coverage rows. It does not grade, it does not
 * gate, it does not schedule, and it does not touch a single line of the attempt
 * path — `AttemptService`, `QuizAccessService`, `LessonAccessService` and
 * `attemptAllowance` are all untouched by this feature. That is the point: a
 * real cohort sits a real exam the week this ships, and a countdown must not be
 * able to break the paper.
 *
 * Scheduling is `quizzes.open_from` / `open_until`, which the engine has always
 * had and already enforces in `assertCanAttempt`. This service only writes them.
 *
 * ## Why an exam is a Lesson
 *
 * See `docs/superpowers/specs/2026-09-08-monthly-exams-honor-board-design.md`
 * §1 and the header of `20260909000000_exam_coverage/migration.sql`. Short
 * version: thirteen analytics joins and every grade notification are keyed on
 * `quizzes.lesson_id`, and a lesson-free quiz empties all of them silently.
 *
 * ## Why an exam is NOT reachable from the lesson panel
 *
 * `LESSON_KINDS` there is `['video','text','attachment']` deliberately — a
 * standalone quiz in the outline was counted as a lecture and could shut the
 * rest of the course behind one failed sitting («ما يبقاش يضاف الكويز لوحده»).
 * A monthly exam is the case that rule was not about, so it gets its own door
 * and stays out of the outline, out of `/api/me/path`, and out of the public
 * catalogue. Those three exclusions are enforced elsewhere and each has a test.
 */
@Injectable()
export class ScheduledExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The shelf, created on first use and published.
   *
   * ⚠️ `isPublished: true` is not a default, it is a fix. `LessonAccessService.
   * resolve` does NOT check `section.isPublished` while
   * `LessonGateService.resolveCourse` DOES — so an unpublished shelf 404s the
   * intro page for everyone while `assertCanAttempt` happily opens attempts. A
   * total, silent failure at 20:01. The admin list surfaces this flag on every
   * row for the same reason.
   *
   * It is placed LAST in the course, so it never renumbers a lecture.
   */
  private async ensureShelf(tx: TransactionClient, courseId: string): Promise<string> {
    const existing = await tx.courseSection.findFirst({
      where: { courseId, title: EXAM_SHELF_TITLE },
      select: { id: true },
    });
    if (existing) return existing.id;

    const last = await tx.courseSection.findFirst({
      where: { courseId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const created = await tx.courseSection.create({
      data: {
        courseId,
        title: EXAM_SHELF_TITLE,
        position: (last?.position ?? -1) + 1,
        isPublished: true,
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Rewrites an exam's whole syllabus in one statement.
   *
   * The delete-all/insert-all shape needs the DEFERRABLE unique on
   * `(exam_lesson_id, position)` — same dance, and same reason, as
   * `QuizBuilderService.reorderSlots`. Same-course is not checked here at all:
   * the two composite FKs against `lessons(id, course_id)` make it a database
   * fact, so a covered lesson from another course is a 23503, not a silent
   * miswrite.
   */
  private async replaceCoverage(
    tx: TransactionClient,
    examLessonId: string,
    courseId: string,
    coveredLessonIds: string[],
  ): Promise<void> {
    if (coveredLessonIds.includes(examLessonId)) {
      throw new BadRequestException({ code: 'exam_cannot_cover_itself' });
    }

    await tx.$executeRaw`SET CONSTRAINTS "app"."exam_coverage_exam_position_key" DEFERRED`;
    await tx.examCoverage.deleteMany({ where: { examLessonId } });
    await tx.examCoverage.createMany({
      data: coveredLessonIds.map((coveredLessonId, position) => ({
        examLessonId,
        coveredLessonId,
        courseId,
        position,
      })),
    });
  }

  /**
   * One submit produces the shelf, the lesson, the quiz and the syllabus.
   *
   * It arrives as a DRAFT on both the lesson and the quiz. An exam with no
   * questions in it must not be able to reach a student, and the only thing
   * standing between "created" and "visible" should be an explicit act with a
   * preflight behind it — which is what `publish` is.
   */
  async create(input: AdminExamCreateInput, actorUserId: string): Promise<{ lessonId: string }> {
    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException({ code: 'course_not_found' });

    const lessonId = await this.prisma.$transaction(async (tx) => {
      const sectionId = await this.ensureShelf(tx, input.courseId);

      const last = await tx.lesson.findFirst({
        where: { sectionId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      const lesson = await tx.lesson.create({
        data: {
          courseId: input.courseId,
          sectionId,
          title: input.title,
          kind: 'quiz',
          position: (last?.position ?? -1) + 1,
          isPublished: false,
        },
        select: { id: true },
      });

      await tx.quiz.create({
        data: {
          lessonId: lesson.id,
          durationSeconds: input.durationMinutes * 60,
          openFrom: input.opensAt,
          openUntil: input.closesAt,
          // ⚠️ EXPLICIT, never left to a default. `allowsImprovement` is what
          // grants a second sitting (تحسين), and `assertPaperAllowed` only ever
          // reads this boolean — the "course exams only" rule is a UI and
          // publish-time convention, not a check. A monthly exam with this true
          // is a student sitting it twice. `QuizBuilderService.upsertForLesson`
          // now refuses to flip it here too, so the API cannot undo this line.
          allowsImprovement: false,
          passPercent: input.passPercent,
          gradeOutOf: input.gradeOutOf,
          sumMarks: 0,
          isPublished: false,
          // The platform default, taken deliberately rather than invented:
          // `laterWhileOpen` grants everything EXCEPT the model answer, which
          // is exactly right for an exam still open to the rest of the cohort —
          // a student who finished at 20:30 must not be able to photograph the
          // key and circulate it while classmates are still sitting it. It
          // unlocks by itself at `openUntil`.
          reviewOptions: DEFAULT_REVIEW_OPTIONS,
        },
      });

      await this.replaceCoverage(tx, lesson.id, input.courseId, input.coveredLessonIds);
      return lesson.id;
    });

    await this.audit.record({
      action: 'exam:create',
      resourceType: AUDIT_RESOURCES.quiz,
      resourceId: lessonId,
      outcome: 'success',
      actorUserId,
      metadata: {
        courseId: input.courseId,
        title: input.title,
        opensAt: input.opensAt.toISOString(),
        closesAt: input.closesAt.toISOString(),
        coveredLessonCount: input.coveredLessonIds.length,
      },
    });

    return { lessonId };
  }

  /** Edits one. Every field optional and none defaulted — see the PATCH
   *  schema's own note on why `.partial()` is banned here. */
  async patch(
    lessonId: string,
    input: AdminExamPatchInput,
    actorUserId: string,
  ): Promise<void> {
    const lesson = await this.requireExamLesson(lessonId);

    await this.prisma.$transaction(async (tx) => {
      if (input.title !== undefined) {
        await tx.lesson.update({ where: { id: lessonId }, data: { title: input.title } });
      }

      const quizData: Prisma.QuizUpdateInput = {};
      if (input.opensAt !== undefined) quizData.openFrom = input.opensAt;
      if (input.closesAt !== undefined) quizData.openUntil = input.closesAt;
      if (input.durationMinutes !== undefined) {
        quizData.durationSeconds = input.durationMinutes * 60;
      }
      if (input.gradeOutOf !== undefined) quizData.gradeOutOf = input.gradeOutOf;
      if (input.passPercent !== undefined) quizData.passPercent = input.passPercent;

      if (Object.keys(quizData).length > 0) {
        // A window is only half-checked by the schema when one side is absent
        // from the PATCH. Re-read the stored pair and check the pair that will
        // actually exist, so a PATCH moving only `opensAt` past a stored
        // `closesAt` is a 400 rather than an exam that can never open.
        const current = await tx.quiz.findUniqueOrThrow({
          where: { lessonId },
          select: { openFrom: true, openUntil: true },
        });
        const from = input.opensAt ?? current.openFrom;
        const until = input.closesAt ?? current.openUntil;
        if (from && until && until <= from) {
          throw new BadRequestException({ code: 'exam_window_inverted' });
        }
        await tx.quiz.update({ where: { lessonId }, data: quizData });
      }

      if (input.coveredLessonIds !== undefined) {
        await this.replaceCoverage(tx, lessonId, lesson.courseId, input.coveredLessonIds);
      }
    });

    await this.audit.record({
      action: 'exam:update',
      resourceType: AUDIT_RESOURCES.quiz,
      resourceId: lessonId,
      outcome: 'success',
      actorUserId,
      metadata: { fields: Object.keys(input) },
    });
  }

  private async requireExamLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, kind: 'quiz', section: { title: EXAM_SHELF_TITLE } },
      select: { id: true, courseId: true, sectionId: true, title: true },
    });
    if (!lesson) throw new NotFoundException({ code: 'exam_not_found' });
    return lesson;
  }

  /**
   * ONE endpoint, not two calls from a server action.
   *
   * `QuizBuilderService.publish` runs the preflight (no slots, a slot with no
   * ready version, a pool that cannot fill its pick count, a non-positive
   * total) and each failure carries a machine-readable code the admin UI points
   * at a row with. The LESSON publish then follows in the same transaction. A
   * two-call client can leave an exam half-published — a live quiz on an
   * invisible lesson — which reads to the owner as "it just didn't work".
   */
  async setPublished(
    lessonId: string,
    published: boolean,
    actorUserId: string,
  ): Promise<void> {
    await this.requireExamLesson(lessonId);

    await this.prisma.$transaction(async (tx) => {
      if (published) {
        const quiz = await tx.quiz.findUniqueOrThrow({
          where: { lessonId },
          select: { id: true, sumMarks: true, slots: { select: { id: true } } },
        });
        if (quiz.slots.length === 0) {
          throw new BadRequestException({ code: 'quiz_has_no_slots' });
        }
        if (Number(quiz.sumMarks) <= 0) {
          throw new BadRequestException({ code: 'sum_marks_must_be_positive' });
        }
      }
      await tx.quiz.update({ where: { lessonId }, data: { isPublished: published } });
      await tx.lesson.update({ where: { id: lessonId }, data: { isPublished: published } });
    });

    await this.audit.record({
      action: published ? 'exam:publish' : 'exam:unpublish',
      resourceType: AUDIT_RESOURCES.quiz,
      resourceId: lessonId,
      outcome: 'success',
      actorUserId,
    });
  }

  /**
   * Deleting cascades the quiz, every attempt and every coverage row,
   * permanently. So it refuses once anyone has sat it — the honest action then
   * is `setPublished(false)`, which takes it off the dashboard and keeps the
   * grades.
   */
  async remove(lessonId: string, actorUserId: string): Promise<void> {
    await this.requireExamLesson(lessonId);

    const attempts = await this.prisma.quizAttempt.count({
      where: { quiz: { lessonId } },
    });
    if (attempts > 0) {
      throw new BadRequestException({ code: 'exam_has_attempts', attempts });
    }

    await this.prisma.lesson.delete({ where: { id: lessonId } });

    await this.audit.record({
      action: 'exam:delete',
      resourceType: AUDIT_RESOURCES.quiz,
      resourceId: lessonId,
      outcome: 'success',
      actorUserId,
    });
  }

  /**
   * «كرر الامتحان ده على باقي الكورسات».
   *
   * His rhythm is four courses, one per part, twice a month. This is that
   * rhythm as a button — deliberately NOT as a `UNIQUE(year, month, slot)`
   * constraint, which is the shape one design proposed and which would refuse
   * him a make-up paper with a 23505 he cannot route around at 19:45.
   *
   * The window, the duration and the marks are copied; the covered lessons are
   * named per target, because the parts do not line up. Questions are NOT
   * copied — each paper is his to write.
   */
  async duplicate(
    lessonId: string,
    input: AdminExamDuplicateInput,
    actorUserId: string,
  ): Promise<{ lessonIds: string[] }> {
    await this.requireExamLesson(lessonId);
    const source = await this.prisma.quiz.findUniqueOrThrow({
      where: { lessonId },
      select: {
        durationSeconds: true,
        openFrom: true,
        openUntil: true,
        gradeOutOf: true,
        passPercent: true,
        lesson: { select: { title: true } },
      },
    });

    if (source.openFrom === null || source.openUntil === null) {
      throw new BadRequestException({ code: 'exam_has_no_window' });
    }

    const lessonIds: string[] = [];
    for (const target of input.targets) {
      const created = await this.create(
        {
          courseId: target.courseId,
          title: target.title ?? source.lesson.title,
          coveredLessonIds: target.coveredLessonIds,
          opensAt: source.openFrom,
          closesAt: source.openUntil,
          durationMinutes: Math.max(1, Math.round((source.durationSeconds ?? 3600) / 60)),
          gradeOutOf: Number(source.gradeOutOf),
          passPercent: Number(source.passPercent),
        },
        actorUserId,
      );
      lessonIds.push(created.lessonId);
    }

    return { lessonIds };
  }

  /** The coverage picker — a course's lessons grouped by section, exam shelves
   *  excluded (an exam is never on another exam). */
  async lessonPicker(courseId: string): Promise<ExamLessonPicker> {
    const sections = await this.prisma.courseSection.findMany({
      where: { courseId, title: { not: EXAM_SHELF_TITLE } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        lessons: {
          where: { kind: { not: 'quiz' } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, isPublished: true },
        },
      },
    });

    return {
      sections: sections
        .filter((s) => s.lessons.length > 0)
        .map((s) => ({
          sectionId: s.id,
          title: s.title,
          lessons: s.lessons.map((l) => ({
            lessonId: l.id,
            title: l.title,
            isPublished: l.isPublished,
          })),
        })),
    };
  }

  /** The admin's cross-course list — «إيه اللي نازل ومتى؟». */
  async list(): Promise<AdminExamList> {
    const now = new Date();

    const lessons = await this.prisma.lesson.findMany({
      where: { kind: 'quiz', section: { title: EXAM_SHELF_TITLE } },
      select: {
        id: true,
        title: true,
        courseId: true,
        isPublished: true,
        course: { select: { title: true } },
        section: { select: { isPublished: true } },
        quiz: {
          select: {
            id: true,
            isPublished: true,
            openFrom: true,
            openUntil: true,
            durationSeconds: true,
            gradeOutOf: true,
            _count: { select: { slots: true, attempts: true } },
          },
        },
        coversLessons: {
          orderBy: { position: 'asc' },
          select: { coveredLessonId: true, coveredLesson: { select: { title: true } } },
        },
      },
    });

    // One grouped count rather than a per-row query: the queue is small but the
    // list is cross-course, and N+1 here is N+1 forever.
    const pending = await this.prisma.attemptQuestion.groupBy({
      by: ['attemptId'],
      where: {
        state: 'needs_grading',
        attempt: {
          state: { in: [...GRADED_STATES] },
          quiz: { lesson: { kind: 'quiz', section: { title: EXAM_SHELF_TITLE } } },
        },
      },
      _count: { _all: true },
    });
    const pendingAttemptIds = new Set(pending.map((p) => p.attemptId));
    const attemptsByQuiz = pendingAttemptIds.size
      ? await this.prisma.quizAttempt.findMany({
          where: { id: { in: [...pendingAttemptIds] } },
          select: { id: true, quizId: true },
        })
      : [];
    const needsGradingByQuiz = new Map<string, number>();
    for (const a of attemptsByQuiz) {
      needsGradingByQuiz.set(a.quizId, (needsGradingByQuiz.get(a.quizId) ?? 0) + 1);
    }

    const exams = lessons.map((l) => ({
      lessonId: l.id,
      quizId: l.quiz?.id ?? null,
      courseId: l.courseId,
      courseTitle: l.course.title,
      title: l.title,
      phase: examPhase(l.quiz?.openFrom ?? null, l.quiz?.openUntil ?? null, now),
      opensAt: l.quiz?.openFrom?.toISOString() ?? null,
      closesAt: l.quiz?.openUntil?.toISOString() ?? null,
      durationMinutes: l.quiz?.durationSeconds ? Math.round(l.quiz.durationSeconds / 60) : null,
      gradeOutOf: Number(l.quiz?.gradeOutOf ?? 100),
      lessonPublished: l.isPublished,
      quizPublished: l.quiz?.isPublished ?? false,
      sectionPublished: l.section.isPublished,
      questionCount: l.quiz?._count.slots ?? 0,
      coveredLessons: l.coversLessons.map((c) => ({
        lessonId: c.coveredLessonId,
        title: c.coveredLesson.title,
      })),
      attemptCount: l.quiz?._count.attempts ?? 0,
      needsGradingCount: l.quiz ? (needsGradingByQuiz.get(l.quiz.id) ?? 0) : 0,
    }));

    // Soonest first among what is live or coming; then the history, newest
    // first. He reads this page to answer «إيه الجاي؟», not «إيه اللي فات؟».
    const rank = { open: 0, upcoming: 1, closed: 2 } as const;
    exams.sort((a, b) => {
      if (rank[a.phase] !== rank[b.phase]) return rank[a.phase] - rank[b.phase];
      const at = a.opensAt ?? '';
      const bt = b.opensAt ?? '';
      return a.phase === 'closed' ? bt.localeCompare(at) : at.localeCompare(bt);
    });

    return { exams, serverTime: now.toISOString() };
  }

  /**
   * `GET /api/me/exams` — the student's own scheduled exams.
   *
   * Enrolment is the only gate, which is his answer verbatim: «أي حد مشترك في
   * الكورس، من غير فلوس زيادة». `ACTIVE_ENROLLMENT_STATUSES` is `['active',
   * 'completed']`, the same pair the dashboard already treats as enrolled.
   *
   * Both the lesson and the quiz must be published: a draft exam is invisible,
   * and the two flags are separate because an exam can be legitimately
   * mid-authoring on either side.
   */
  async forStudent(userId: string): Promise<StudentExams> {
    const now = new Date();

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    if (courseIds.length === 0) return { exams: [], serverTime: now.toISOString() };

    const lessons = await this.prisma.lesson.findMany({
      where: {
        kind: 'quiz',
        isPublished: true,
        courseId: { in: courseIds },
        section: { title: EXAM_SHELF_TITLE, isPublished: true },
        quiz: { isPublished: true, openFrom: { not: null } },
      },
      select: {
        id: true,
        title: true,
        courseId: true,
        course: { select: { title: true, slug: true } },
        quiz: {
          select: {
            id: true,
            openFrom: true,
            openUntil: true,
            durationSeconds: true,
            gradeOutOf: true,
          },
        },
        coversLessons: {
          orderBy: { position: 'asc' },
          select: { coveredLessonId: true, coveredLesson: { select: { title: true } } },
        },
      },
    });

    const quizIds = lessons.map((l) => l.quiz!.id);
    const attempts = quizIds.length
      ? await this.prisma.quizAttempt.findMany({
          where: { userId, quizId: { in: quizIds }, state: { in: [...GRADED_STATES] } },
          select: { quizId: true, scaledScore: true },
        })
      : [];

    // Their BEST sitting, matching `countingAttemptId`'s rule that the grade is
    // the highest score. Null — never 0 — when they have not sat it: rendering
    // ٠ tells a student who has not taken the exam that they failed it.
    const bestByQuiz = new Map<string, number | null>();
    for (const a of attempts) {
      const score = a.scaledScore === null ? null : Number(a.scaledScore);
      const seen = bestByQuiz.get(a.quizId);
      if (seen === undefined || (score !== null && (seen === null || score > seen))) {
        bestByQuiz.set(a.quizId, score);
      }
    }

    const exams = lessons.map((l) => {
      const quiz = l.quiz!;
      return {
        lessonId: l.id,
        courseId: l.courseId,
        courseTitle: l.course.title,
        courseSlug: l.course.slug,
        title: l.title,
        phase: examPhase(quiz.openFrom, quiz.openUntil, now),
        openFrom: quiz.openFrom?.toISOString() ?? null,
        openUntil: quiz.openUntil?.toISOString() ?? null,
        durationSeconds: quiz.durationSeconds,
        gradeOutOf: Number(quiz.gradeOutOf),
        coveredLessons: l.coversLessons.map((c) => ({
          lessonId: c.coveredLessonId,
          title: c.coveredLesson.title,
        })),
        scaledScore: bestByQuiz.get(quiz.id) ?? null,
        hasSat: bestByQuiz.has(quiz.id),
      };
    });

    const rank = { open: 0, upcoming: 1, closed: 2 } as const;
    exams.sort((a, b) => {
      if (rank[a.phase] !== rank[b.phase]) return rank[a.phase] - rank[b.phase];
      const at = a.openFrom ?? '';
      const bt = b.openFrom ?? '';
      return a.phase === 'closed' ? bt.localeCompare(at) : at.localeCompare(bt);
    });

    return { exams, serverTime: now.toISOString() };
  }
}
