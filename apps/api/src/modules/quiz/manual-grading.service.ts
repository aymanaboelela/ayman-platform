import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminGradeAnswerInput,
  AdminGradedRow,
  AdminGradingAttempt,
  AdminGradingQueue,
  AdminGradingResults,
  GradingScope,
  GradingSort,
} from '@ayman/contracts/admin/exams';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { AttemptService } from './attempt.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '../../generated/prisma/client';
import { clamp, fractionToState, roundMark } from './grading/fraction';
import { splitPendingMarks } from './grading/mark-split';
import { GRADED_STATES } from './analytics.service';

/** One row of the `results` raw query, before it is turned into the wire
 *  shape. Postgres hands `numeric` back as a Prisma `Decimal`, so every money-
 *  shaped column is read through `Number(...)` in `toGradedRow`. */
interface GradingResultRow {
  attempt_id: string;
  student_user_id: string;
  student_name: string;
  quiz_title: string;
  lesson_id: string;
  submitted_at: Date | null;
  scaled_score: unknown;
  grade_out_of: unknown;
  passed: boolean | null;
  percent: number | null;
  duration_seconds: number | null;
  hand_marked: boolean;
}

function toGradedRow(row: GradingResultRow): AdminGradedRow {
  return {
    attemptId: row.attempt_id,
    studentUserId: row.student_user_id,
    studentName: row.student_name,
    quizTitle: row.quiz_title,
    lessonId: row.lesson_id,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    durationSeconds: row.duration_seconds,
    scaledScore: row.scaled_score === null ? null : Number(row.scaled_score),
    gradeOutOf: Number(row.grade_out_of),
    // Clamped rather than trusted: `scaled_score` can exceed `grade_out_of` on
    // a paper whose slots were edited after it was sat, and the contract caps
    // this at 100 — an uncaught 104 would fail the parse and blank the screen.
    percent: row.percent === null ? null : Math.min(Math.max(row.percent, 0), 100),
    passed: row.passed,
    handMarked: row.hand_marked,
  };
}

/**
 * التصحيح اليدوي — marking an answer a machine cannot mark.
 *
 * ## This closes a hole that was already open
 *
 * `gradeQuestion` returns `needs_grading` for an essay and never scores it.
 * `needs_grading` is inside `GRADED_STATES`, so the attempt counts as graded
 * everywhere on the platform — in `/api/me/quizzes`, in `MasteryService`, in the
 * admin cohort roster, in item analysis — with that question contributing ZERO.
 *
 * And there was no way to fix it: `AdminAttemptsController` exposed only reopen,
 * extra-time and extra-attempt, and `AttemptService.recomputeScore` /
 * `recomputeScoreTx` existed with **zero callers**. An essay question was a
 * permanent zero, silently, for every student who ever answered one.
 *
 * That was survivable while nothing important rode on it. A monthly exam with an
 * essay in it feeds the honor board, so it stops being survivable: the student
 * who wrote the best answer ranks last.
 *
 * ## Why the write goes through `recomputeScoreTx` and not an UPDATE
 *
 * A mark on one question changes the attempt's `rawScore`, `scaledScore`,
 * `passed` AND `state` (`pending_review` → `submitted` once nothing is left
 * ungraded). `gradeAttempt` is the only thing that knows how, and it reads the
 * attempt's OWN snapshots (`sumMarks`, `gradeOutOf`, `passPercent`) rather than
 * the quiz's live settings — so marking an essay months later rescales against
 * the paper as it was sat, not as it looks now. Both writes are in one
 * transaction: a marked question with a stale total is a score nobody can
 * explain.
 */
@Injectable()
export class ManualGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attempts: AttemptService,
    private readonly notifications: NotificationsService,
  ) {}

  /** «ورقات محتاجة تصحيح» — without this he has no way to FIND them. */
  async queue(): Promise<AdminGradingQueue> {
    const pending = await this.prisma.attemptQuestion.groupBy({
      by: ['attemptId'],
      where: {
        state: 'needs_grading',
        attempt: { state: { in: [...GRADED_STATES] } },
      },
      _count: { _all: true },
      // What the unmarked answers are WORTH, not only how many there are. «٢
      // سؤال» is the same sentence whether it is two marks or fifty, and on a
      // midterm it is fifty — which is the difference between a paper that can
      // wait and one a student is staring at a provisional near-fail over.
      _sum: { maxMark: true },
    });
    if (pending.length === 0) return { rows: [] };

    const counts = new Map(pending.map((p) => [p.attemptId, p._count._all]));
    const marks = new Map(pending.map((p) => [p.attemptId, Number(p._sum.maxMark ?? 0)]));
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { id: { in: [...counts.keys()] } },
      // Oldest first: a paper waiting three days is more urgent than one that
      // landed a minute ago, and this queue is read to be emptied.
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        submittedAt: true,
        sumMarks: true,
        gradeOutOf: true,
        userId: true,
        user: { select: { studentProfile: { select: { fullName: true } } } },
        quiz: { select: { lessonId: true, lesson: { select: { title: true } } } },
      },
    });

    return {
      rows: attempts.map((a) => ({
        attemptId: a.id,
        studentUserId: a.userId,
        studentName: a.user.studentProfile?.fullName ?? '—',
        quizTitle: a.quiz.lesson.title,
        lessonId: a.quiz.lessonId,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        pendingCount: counts.get(a.id) ?? 0,
        // Rescaled onto the attempt's own `gradeOutOf`, exactly as the
        // student's results screen does it (`mark-split.ts`) — so the number
        // on this row and the number on theirs are the same number, rather
        // than the raw paper-scale sum that would disagree with it on the 150
        // of 154 quizzes where the two totals differ.
        pendingMarks: splitPendingMarks(marks.get(a.id) ?? 0, {
          sumMarks: Number(a.sumMarks),
          gradeOutOf: Number(a.gradeOutOf),
        }).pendingOutOf,
        gradeOutOf: Number(a.gradeOutOf),
      })),
    };
  }

  /**
   * «اتصحّح خلاص» و«الأوائل» — finished sittings, ordered.
   *
   * ## Why this exists
   *
   * Marking the last answer on a paper made it disappear off the queue and
   * appear nowhere else. There was no screen that answered "what did I give
   * this person", "was that mark right", or "how did the class actually do" —
   * the marks existed only inside each student's own account.
   *
   * ## Why raw SQL
   *
   * Two of the four orders cannot be expressed in Prisma's `orderBy` at all:
   * «الأوائل» ranks on `scaled_score / grade_out_of` (two papers marked out of
   * different totals are not comparable on `scaled_score` alone) and «الأسرع»
   * ranks on `submitted_at - started_at`. Sorting in Node instead would mean
   * loading every finished attempt on the platform — a real cohort, thousands
   * of rows — to render fifty.
   *
   * The ORDER BY is chosen from a fixed map keyed by an enum the DTO already
   * validated; it is never interpolated from a request value. `lessonId` and
   * every other value goes through a parameter placeholder.
   */
  async results(options: {
    scope: GradingScope;
    sort: GradingSort;
    lessonId?: string;
    limit?: number;
  }): Promise<AdminGradingResults> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);

    /*
     * NULLS LAST on every order: an attempt with no submission stamp or no
     * score has nothing to contribute to a ranking, and Postgres sorts NULL
     * FIRST on DESC by default — which would put empty rows at the top of
     * «الأوائل», the one place they are most conspicuous.
     *
     * `a."id"` is the tiebreak on all five. `uuid(7)` is chronological here
     * (see the column's own default), so ties resolve to submission order
     * rather than to whatever the planner happened to return — without it a
     * page of equal scores can duplicate and drop rows.
     */
    const ORDER_BY: Record<GradingSort, Prisma.Sql> = {
      score: Prisma.sql`percent DESC NULLS LAST, a."id" ASC`,
      fastest: Prisma.sql`duration_seconds ASC NULLS LAST, a."id" ASC`,
      latest: Prisma.sql`a."submitted_at" DESC NULLS LAST, a."id" DESC`,
      earliest: Prisma.sql`a."submitted_at" ASC NULLS LAST, a."id" ASC`,
      name: Prisma.sql`student_name ASC NULLS LAST, a."id" ASC`,
    };

    // «اتصحّح خلاص» is papers a HUMAN touched — `graded_by` is null on
    // everything the engine scored, so it is the only honest test of "did I
    // mark this". «الأوائل» draws on every finished sitting instead, because a
    // ranking that silently omitted the all-MCQ papers would be a ranking of
    // who happened to write an essay.
    const scopeFilter =
      options.scope === 'marked'
        ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM "app"."attempt_questions" gq
            WHERE gq."attempt_id" = a."id" AND gq."graded_by" IS NOT NULL
          )`
        : Prisma.empty;

    const lessonFilter = options.lessonId
      ? Prisma.sql`AND q."lesson_id" = ${options.lessonId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<GradingResultRow[]>`
      SELECT
        a."id"            AS attempt_id,
        a."user_id"       AS student_user_id,
        coalesce(sp."full_name", '—') AS student_name,
        l."title"         AS quiz_title,
        q."lesson_id"     AS lesson_id,
        a."submitted_at"  AS submitted_at,
        a."scaled_score"  AS scaled_score,
        a."grade_out_of"  AS grade_out_of,
        a."passed"        AS passed,
        CASE WHEN a."grade_out_of" > 0 AND a."scaled_score" IS NOT NULL
             THEN round(a."scaled_score" / a."grade_out_of" * 100)::int
             ELSE NULL END AS percent,
        CASE WHEN a."submitted_at" IS NOT NULL
             THEN greatest(0, extract(epoch FROM a."submitted_at" - a."started_at"))::int
             ELSE NULL END AS duration_seconds,
        EXISTS (
          SELECT 1 FROM "app"."attempt_questions" hq
          WHERE hq."attempt_id" = a."id" AND hq."graded_by" IS NOT NULL
        ) AS hand_marked
      FROM "app"."quiz_attempts" a
      JOIN "app"."quizzes" q  ON q."id" = a."quiz_id"
      JOIN "app"."lessons"  l ON l."id" = q."lesson_id"
      LEFT JOIN "app"."student_profiles" sp ON sp."user_id" = a."user_id"
      -- submitted only, never pending_review: a paper with an answer still
      -- unmarked has a provisional total, and putting that in a ranking is the
      -- same lie the student's own results screen was fixed for.
      -- (No backticks anywhere in this template -- one would close it.)
      WHERE a."state" = 'submitted'
        AND a."submitted_at" IS NOT NULL
        ${scopeFilter}
        ${lessonFilter}
      ORDER BY ${ORDER_BY[options.sort]}
      LIMIT ${limit}
    `;

    /*
     * The filter's options come from the same read, not from `/admin/exams`:
     * what belongs in this dropdown is what actually has a sitting to look at,
     * and an exam nobody has taken is a choice that leads to an empty screen.
     */
    const exams = await this.prisma.lesson.findMany({
      where: { quiz: { attempts: { some: { state: 'submitted' } } } },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
      take: 200,
    });

    return {
      rows: rows.map(toGradedRow),
      exams: exams.map((exam) => ({ lessonId: exam.id, title: exam.title })),
    };
  }

  /**
   * One attempt's ungraded answers.
   *
   * ⚠️ This payload carries the student's written answer and the question stem,
   * so it must never be reachable by a student — it is `attempt:grade`, which is
   * admin-only. It deliberately does NOT carry the model answer: an essay has
   * none to carry, and adding one would put an answer key on a route whose whole
   * job is that a human supplies it.
   */
  async forAttempt(attemptId: string): Promise<AdminGradingAttempt> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        submittedAt: true,
        scaledScore: true,
        gradeOutOf: true,
        userId: true,
        user: { select: { studentProfile: { select: { fullName: true } } } },
        quiz: { select: { lesson: { select: { title: true } } } },
        questions: {
          // Not just what is UNMARKED — also what a human has already marked,
          // so a mark can be revised. «أقدر أعدل على كل حاجة»: a typo'd 3 that
          // can only be corrected by a developer is worse than no screen.
          // MCQs stay out: `gradedBy` is null on anything the engine scored.
          where: { OR: [{ state: 'needs_grading' }, { gradedBy: { not: null } }] },
          orderBy: { slotPosition: 'asc' },
          select: {
            id: true,
            slotPosition: true,
            state: true,
            responseText: true,
            mark: true,
            maxMark: true,
            feedbackHtml: true,
            version: { select: { stemHtml: true } },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException({ code: 'attempt_not_found' });

    return {
      attemptId: attempt.id,
      studentUserId: attempt.userId,
      studentName: attempt.user.studentProfile?.fullName ?? '—',
      quizTitle: attempt.quiz.lesson.title,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      gradeOutOf: Number(attempt.gradeOutOf),
      scaledScore: attempt.scaledScore === null ? null : Number(attempt.scaledScore),
      questions: attempt.questions.map((q) => ({
        attemptQuestionId: q.id,
        slotPosition: q.slotPosition,
        questionHtml: q.version.stemHtml,
        responseText: q.responseText,
        maxMark: Number(q.maxMark),
        // Null, not 0. "Unmarked" and "marked zero" are different facts, and
        // this screen exists precisely to turn the first into the second — so
        // the empty box must not arrive pre-filled with a zero nobody typed.
        mark: q.state === 'needs_grading' || q.mark === null ? null : Number(q.mark),
        feedbackHtml: q.feedbackHtml,
      })),
    };
  }

  async grade(
    attemptId: string,
    attemptQuestionId: string,
    input: AdminGradeAnswerInput,
    actorUserId: string,
  ): Promise<{ scaledScore: number | null }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attemptQuestion.findFirst({
        where: { id: attemptQuestionId, attemptId },
        select: {
          id: true,
          maxMark: true,
          minFraction: true,
          maxFraction: true,
          // Read BEFORE the write, because the write is what changes it. The
          // notification below has to fire on the transition into
          // `submitted` and not merely on the state afterwards — otherwise
          // correcting a typo'd mark on an already-finished paper months
          // later re-announces the result to the student every time.
          attempt: { select: { state: true, quiz: { select: { lessonId: true } } } },
        },
      });
      if (!row) throw new NotFoundException({ code: 'attempt_question_not_found' });
      const wasPending = row.attempt.state === 'pending_review';

      const maxMark = Number(row.maxMark);
      if (maxMark <= 0) throw new BadRequestException({ code: 'question_has_no_marks' });

      // Clamped, not rejected: an admin typing 20 into a 5-mark box is a slip,
      // and a 400 in the middle of marking thirty papers is worse than the
      // obvious correction. The clamped value is what the audit row records.
      const mark = roundMark(clamp(input.mark, 0, maxMark));
      const fraction = clamp(mark / maxMark, Number(row.minFraction), Number(row.maxFraction));

      await tx.attemptQuestion.update({
        where: { id: attemptQuestionId },
        data: {
          mark,
          fraction,
          state: fractionToState(fraction),
          feedbackHtml:
            input.feedbackHtml === undefined ? undefined : sanitizeRichText(input.feedbackHtml),
          gradedAt: new Date(),
          // Stamped so the screen can tell a HUMAN mark from an engine one and
          // offer it for revision — `gradedBy` is null on everything
          // `gradeQuestion` scored.
          gradedBy: actorUserId,
        },
      });

      // Same transaction: the question's mark and the attempt's total must move
      // together or the student sees a marked answer inside an unchanged score.
      const recomputed = await this.attempts.recomputeScoreTx(tx, attemptId);

      /*
       * «وهيتبعتلك» — the other half of the promise the results screen makes.
       *
       * At submit the student was told the auto-marked part was done and that
       * N marks were still here (`quiz_graded` with a non-zero `pendingOutOf`).
       * This is the row that closes it: the LAST ungraded answer on the paper
       * has just been marked, so the attempt has left `pending_review`, and
       * the total is finally a total. Without it the student has to keep
       * opening the exam to check, which is exactly the anxiety the split
       * denominator was added to remove.
       *
       * In the SAME transaction as the mark and the score, for the reason the
       * submit path documents: a notification about a grade that was rolled
       * back sends them looking for a result that does not exist.
       */
      if (wasPending && recomputed.attemptState === 'submitted') {
        await this.notifications.emit(tx, {
          userId: recomputed.userId,
          kind: 'quiz_graded',
          lessonId: recomputed.lessonId,
          attemptId,
          scorePercent:
            recomputed.gradeOutOf > 0
              ? Math.round((recomputed.scaledScore / recomputed.gradeOutOf) * 100)
              : 0,
          passed: recomputed.passed,
          // Zero BY CONSTRUCTION — `attemptState` is `submitted` precisely
          // because nothing is left. It is passed explicitly rather than
          // defaulted so this reads as the finished counterpart of the
          // receipt emitted at submit.
          pendingOutOf: 0,
        });
      }

      return recomputed;
    });

    await this.audit.record({
      action: 'attempt:grade',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: attemptId,
      outcome: 'success',
      actorUserId,
      metadata: { attemptQuestionId, mark: input.mark, scaledScore: result.scaledScore },
    });

    return { scaledScore: result.scaledScore };
  }
}
