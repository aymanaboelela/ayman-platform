import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { ATTEMPT_SORTS, type AdminAttemptSort } from '@ayman/contracts/admin/attempts';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export { ATTEMPT_SORTS, type AdminAttemptSort };
import { NotificationsService } from '../notifications/notifications.service';
import { escapeLike, foldArabic, FOLD_FROM, FOLD_TO } from '../../common/arabic-fold';
import { phoneSearchDigits } from '../../common/phone-search';
import { attemptQuizKind } from './attempt-quiz-outline';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { toReviewQuestion } from './serializers/review.serializer';
import type {
  AdminAttemptList,
  AdminAttemptListQuery,
  AdminAttemptReview,
  AdminAttemptReviewQuestion,
  AdminAttemptRow,
  AdminAttemptState,
  AdminAttemptStateCounts,
} from '@ayman/contracts/admin/attempts';
import type { ReviewFlags } from '@ayman/contracts/quiz/quiz-settings';
import type { ReviewQuestion } from '@ayman/contracts/quiz/attempt';

export type { AdminAttemptRow };

export interface AdminAttemptFilter {
  quizId?: string;
  /** The quiz by its lesson — the id the course editor and analytics hold. */
  lessonId?: string;
  courseId?: string;
  userId?: string;
  state?: AdminAttemptState;
  /** The STUDENT: their name, hamza-insensitively, or a run of their phone
   *  digits — see `studentMatch`. */
  q?: string;
  take?: number;
  skip?: number;
  /** See `ATTEMPT_SORTS` — the screen had none at all. */
  sort?: AdminAttemptSort;
}

/**
 * One select for every list read, so the cross-quiz page and the per-quiz
 * route cannot disagree about what a row is.
 *
 * The lesson → unit → course chain is what the flat list never carried: a row
 * said «اختبار» and nothing about which course's test it was, which is the
 * whole of the complaint the by-course screen answers.
 */
const ATTEMPT_ROW_SELECT = {
  id: true,
  userId: true,
  quizId: true,
  attemptNo: true,
  paper: true,
  state: true,
  scaledScore: true,
  gradeOutOf: true,
  passed: true,
  startedAt: true,
  submittedAt: true,
  deadlineAt: true,
  user: { select: { name: true } },
  quiz: {
    select: {
      lesson: {
        select: {
          id: true,
          title: true,
          kind: true,
          section: { select: { title: true } },
          course: { select: { id: true, title: true, examLessonId: true } },
        },
      },
    },
  },
} satisfies Prisma.QuizAttemptSelect;

type AttemptRowRecord = Prisma.QuizAttemptGetPayload<{ select: typeof ATTEMPT_ROW_SELECT }>;

function toAdminAttemptRow(row: AttemptRowRecord): AdminAttemptRow {
  const lesson = row.quiz.lesson;
  const score = row.scaledScore === null ? null : Number(row.scaledScore);
  const gradeOutOf = Number(row.gradeOutOf);
  // Only a fully marked paper has a percentage or a verdict to show. A
  // `pending_review` row's score counts its unmarked essays as zero, and
  // `passed` was written from that same provisional total.
  const final = row.state === 'submitted';
  return {
    id: row.id,
    userId: row.userId,
    studentName: row.user.name,
    quizId: row.quizId,
    quizTitle: lesson.title,
    attemptNumber: row.attemptNo,
    state: row.state,
    score,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    deadlineAt: row.deadlineAt?.toISOString() ?? null,
    paper: row.paper,
    gradeOutOf,
    // Multiplied first: 18 * 100 / 20 is a clean 90 in floating point, where
    // (18 / 20) * 100 need not be.
    percent: final && score !== null && gradeOutOf > 0 ? (score * 100) / gradeOutOf : null,
    passed: final ? row.passed : null,
    courseId: lesson.course.id,
    courseTitle: lesson.course.title,
    sectionTitle: lesson.section.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    kind: attemptQuizKind(lesson, lesson.section.title, lesson.course.examLessonId),
  };
}

/**
 * How the sittings are ordered.
 *
 * The screen had NO sort: `orderBy` was a literal in the service and the table
 * swallowed its own `onSortingChange` with a comment saying no server-side sort
 * existed. So «مين جاب أعلى درجة» and «مين سلّم بدري» were both unanswerable on
 * the screen that holds every attempt.
 *
 * `newest` stays the default — the marking queue is worked newest-first — and
 * the two score orders are the addition worth having: a paper at 30% and one at
 * 95% need opposite kinds of attention, and finding either meant reading the
 * whole list.
 *
 * ⚠️ `scaledScore` is NULLABLE (an attempt still in progress has none), so both
 * score orders pin nulls LAST explicitly. Postgres sorts NULLs first on `DESC`
 * by default, which would open «الأعلى درجة» on a screenful of unmarked papers.
 */
function attemptOrderBy(sort: AdminAttemptSort | undefined): Prisma.QuizAttemptOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ startedAt: 'asc' }, { id: 'asc' }];
    case 'score_desc':
      return [{ scaledScore: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    case 'score_asc':
      return [{ scaledScore: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'newest':
    default:
      return [{ startedAt: 'desc' }, { id: 'desc' }];
  }
}


/** Everything on. The instructor wrote the paper — there is nothing on it the
 *  review-window matrix should be hiding from them. See `review`'s own note on
 *  why this is a constant here rather than a role passed into the matrix. */
const ALL_FLAGS: ReviewFlags = {
  response: true,
  correctness: true,
  marks: true,
  specificFeedback: true,
  generalFeedback: true,
  rightAnswer: true,
  overallFeedback: true,
};


/** What counts as «غلط» for the headline. See `review`'s own note on why
 *  `needsGrading`/`pending` are absent. */
const WRONG: ReadonlySet<AdminAttemptReviewQuestion['correctness']> = new Set([
  'incorrect',
  'partial',
  'unanswered',
]);

/**
 * The learner shape → the admin shape.
 *
 * ⚠️ Not a cast. `toReviewQuestion` types `response`/`correctness`/`mark`/
 * `maxMark` as OPTIONAL because it omits whatever the review window forbids,
 * and `ALL_FLAGS` is what makes them always present here — a fact the compiler
 * cannot see through the flags object. Writing the four out gives them
 * concrete defaults, so if `ALL_FLAGS` ever loses an entry the popup renders
 * «مجاوبش» rather than crashing on a field the API silently stopped sending.
 */
function adminQuestion(q: ReviewQuestion): AdminAttemptReviewQuestion {
  return {
    slotPosition: q.slotPosition,
    questionId: q.questionId,
    attemptQuestionId: q.attemptQuestionId,
    type: q.type,
    stemHtml: q.stemHtml,
    options: q.options,
    response: q.response ?? null,
    correctness: q.correctness ?? 'needsGrading',
    mark: q.mark ?? null,
    maxMark: q.maxMark ?? 0,
    ...(q.feedbackHtml === undefined ? {} : { feedbackHtml: q.feedbackHtml }),
    ...(q.generalFeedbackHtml === undefined ? {} : { generalFeedbackHtml: q.generalFeedbackHtml }),
    ...(q.rightAnswerText === undefined ? {} : { rightAnswerText: q.rightAnswerText }),
    ...(q.rightAnswerOptionIds === undefined
      ? {}
      : { rightAnswerOptionIds: q.rightAnswerOptionIds }),
  };
}

/**
 * The escape hatch whose absence generates the competitor's support calls —
 * shipped in the SAME release as the runner (Task 17), not after the first
 * complaint. Every action here is authenticated, permission-gated
 * (`attempt:unlock`) and event-logged, naming the admin as actor.
 */
@Injectable()
export class AttemptAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AttemptEventsService,
    private readonly attempts: AttemptService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The ONE place `submitted_at` is ever set back to NULL.
   *
   * This does not weaken Q4. The student-facing submit path still carries
   * `submitted_at IS NULL` in its WHERE clause, so replay-for-a-better-score
   * remains impossible from the browser. Reopening is an authenticated,
   * permission-gated, event-logged act by an admin — which is exactly the
   * escape hatch whose absence generates the competitor's support calls.
   *
   * `extraSeconds` is ADDITIVE (Q3 restated): `deadlineAt` — persisted once
   * at attempt start — is NEVER rewritten here. The student's new hard stop
   * is `deadlineAt + extraTimeSeconds + graceSeconds`, exactly the formula
   * `saveAnswers`/`submit` already enforce.
   */
  async reopen(adminId: string, attemptId: string, args: { extraSeconds: number }): Promise<void> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true },
    });
    if (!attempt) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.update({
        where: { id: attemptId },
        // M1: `{ increment }` inside the tx, never a read-modify-write of an
        // app-computed sum — two proctors (or a reopen racing a grant) each
        // read the same prior value and clobber one another otherwise, leaving
        // the column and the append-only event log disagreeing on the total.
        data: {
          state: 'in_progress',
          submittedAt: null,
          extraTimeSeconds: { increment: args.extraSeconds },
          lastActivityAt: new Date(),
        },
      });
      // `gradedAt` is what `saveAnswers` checks to keep a practice-mode
      // "checked" question locked (Task 14) — but a normal graded submit
      // stamps it on EVERY question too. Left alone, a reopened student's
      // very first save would hit that same guard and be rejected as
      // "already checked", making the unlock a no-op from their side. The
      // mark/fraction/state themselves are left as-is (that is what "keeps
      // the previous score visible until the student resubmits" means) —
      // the next real `submit()` overwrites all of them anyway via the same
      // `gradeAndStoreQuestion` path a first submit uses.
      await tx.attemptQuestion.updateMany({
        where: { attemptId },
        data: { gradedAt: null },
      });
      await this.events.append(tx, {
        attemptId,
        kind: 'attempt_reopened',
        actorId: adminId,
        payload: { extraSeconds: args.extraSeconds },
      });
    });

    // Rotates the token — kills whatever stale tab still held the old one,
    // exactly like a student's own resume().
    await this.attempts.reissueToken(attemptId);

    // `attempt_events` already records this for the attempt's own timeline.
    // The audit log records it for the ADMIN's timeline — "what did this
    // account do last week" is not answerable from a per-attempt event log.
    await this.audit.record({
      action: 'attempt:unlock',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: attemptId,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { operation: 'reopen', extraSeconds: args.extraSeconds },
    });
  }

  /** Additive extra time on a still-open (or reopened) attempt — the
   *  "running low, give them five more minutes" case, no state change. */
  async grantExtraTime(adminId: string, attemptId: string, seconds: number): Promise<void> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true },
    });
    if (!attempt) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.update({
        where: { id: attemptId },
        // M1: atomic increment, not a read-modify-write (see reopen above).
        data: { extraTimeSeconds: { increment: seconds } },
      });
      await this.events.append(tx, {
        attemptId,
        kind: 'extra_time_granted',
        actorId: adminId,
        payload: { seconds },
      });
    });

    await this.audit.record({
      action: 'attempt:unlock',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: attemptId,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { operation: 'grantExtraTime', seconds },
    });
  }

  /**
   * The allowance a student gets is `attemptAllowance() + SUM(extraAttempts)`
   * across their own attempts (see `AttemptService.start`) — so a grant is
   * recorded on their MOST RECENT attempt row for this quiz, additive and
   * auditable, never a standalone mutable counter.
   */
  async grantExtraAttempt(adminId: string, quizId: string, userId: string): Promise<void> {
    const latest = await this.prisma.quizAttempt.findFirst({
      where: { quizId, userId },
      orderBy: { attemptNo: 'desc' },
      select: { id: true, quiz: { select: { lessonId: true } } },
    });
    if (!latest) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.update({
        where: { id: latest.id },
        // M1: atomic increment, not a read-modify-write (see reopen above).
        data: { extraAttempts: { increment: 1 } },
      });
      await this.events.append(tx, {
        attemptId: latest.id,
        kind: 'extra_attempt_granted',
        actorId: adminId,
        payload: { quizId, userId },
      });

      // The student asked for this and was never told it was done — the whole
      // reason this kind exists. `userId` is the SUBJECT, deliberately not
      // `adminId`: an admin granting an attempt must not notify themselves.
      await this.notifications.emit(tx, {
        userId,
        kind: 'extra_attempt_granted',
        lessonId: latest.quiz.lessonId,
      });
    });

    await this.audit.record({
      action: 'attempt:unlock',
      resourceType: AUDIT_RESOURCES.quizAttempt,
      resourceId: latest.id,
      actorUserId: adminId,
      outcome: 'success',
      metadata: { operation: 'grantExtraAttempt', quizId, userId },
    });
  }

  /**
   * Cross-quiz by default — `quizId` is one optional facet alongside
   * `userId`/`state`/`q`, never the anchor. `GET .../quizzes/:quizId/attempts`
   * is the same call with `quizId` pre-bound (kept because the builder links
   * straight into it), and it still answers the bare array its page parses.
   */
  async listAttempts(filter: AdminAttemptFilter = {}): Promise<AdminAttemptRow[]> {
    const rows = await this.prisma.quizAttempt.findMany({
      where: await this.attemptWhere(filter),
      /* Every branch ends on `id`. A whole class starts the same exam in the
         same second — that is the NORMAL case on this screen, not an edge —
         and Postgres does not order ties stably, so under pagination some
         sittings appear on two pages while others appear on none. */
      orderBy: attemptOrderBy(filter.sort),
      take: Math.min(filter.take ?? 50, 200),
      skip: filter.skip ?? 0,
      select: ATTEMPT_ROW_SELECT,
    });

    return rows.map(toAdminAttemptRow);
  }

  /**
   * `GET /api/admin/attempts` — one PAGE of sittings, with the total and the
   * per-state counts the tabs print.
   *
   * The three reads share one `where`, so «محتاج تصحيح ٣» on a tab is exactly
   * the number of rows that tab opens on — including under a student search,
   * where a quiz-wide count would promise rows the search then hides.
   *
   * Each is one statement over `quiz_attempts`: scoped to a quiz they ride
   * `quiz_attempts_quiz_id_state_idx`, and the student leg is a subquery on
   * `users`, never a row-by-row lookup.
   */
  async searchAttempts(query: AdminAttemptListQuery): Promise<AdminAttemptList> {
    const scope = await this.attemptWhere({ ...query, state: undefined });
    const where: Prisma.QuizAttemptWhereInput = query.state ? { ...scope, state: query.state } : scope;

    const [rowCount, rows, byState] = await Promise.all([
      this.prisma.quizAttempt.count({ where }),
      this.prisma.quizAttempt.findMany({
        where,
        orderBy: attemptOrderBy(query.sort),
        take: query.perPage,
        skip: (query.page - 1) * query.perPage,
        select: ATTEMPT_ROW_SELECT,
      }),
      this.prisma.quizAttempt.groupBy({ by: ['state'], where: scope, _count: { _all: true } }),
    ]);

    const stateCounts: AdminAttemptStateCounts = {
      in_progress: 0,
      overdue: 0,
      submitted: 0,
      pending_review: 0,
      abandoned: 0,
    };
    for (const group of byState) stateCounts[group.state] = group._count._all;

    return { rows: rows.map(toAdminAttemptRow), rowCount, stateCounts };
  }

  private async attemptWhere(filter: AdminAttemptFilter): Promise<Prisma.QuizAttemptWhereInput> {
    const term = filter.q?.trim();
    const quiz: Prisma.QuizWhereInput = {
      ...(filter.lessonId ? { lessonId: filter.lessonId } : {}),
      ...(filter.courseId ? { lesson: { courseId: filter.courseId } } : {}),
    };
    return {
      ...(filter.quizId ? { quizId: filter.quizId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(Object.keys(quiz).length > 0 ? { quiz } : {}),
      ...(term ? { user: await this.studentMatch(term) } : {}),
    };
  }

  /**
   * «أدوّر على طالب» — by the name as it is typed, or by the phone.
   *
   * The name leg matches the account name AND the profile's full name, and
   * then once more hamza-folded (`foldedNameMatches`): «احمد» is how most of
   * Egypt types «أحمد», and `ILIKE` tells the two apart as firmly as it tells
   * «أ» from «ب». The phone leg is a run of digits in the stored E.164 number
   * — see `phoneSearchDigits` for why `010…` has to find `+2010…`.
   */
  private async studentMatch(term: string): Promise<Prisma.UserWhereInput> {
    const digits = phoneSearchDigits(term);
    const folded = await this.foldedNameMatches(term);
    return {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { studentProfile: { fullName: { contains: term, mode: 'insensitive' } } },
        ...(folded.length > 0 ? [{ id: { in: folded } }] : []),
        ...(digits ? [{ phoneNumber: { contains: digits } }] : []),
      ],
    };
  }

  /**
   * The accounts whose name matches only AFTER folding — the same trick, and
   * the same two constants, as `StudentsService.foldedNameMatches`: Prisma's
   * `contains` cannot wrap the column in `translate()`, so the fold runs here
   * and hands back ids.
   *
   * Narrowed to accounts that have sat something (nobody else can appear on
   * this screen), to names the literal match missed (the common case returns
   * nothing, and the `where` is exactly what it was before folding), and
   * capped, so a two-letter search cannot hand Prisma an unbounded `IN` list.
   */
  private async foldedNameMatches(term: string): Promise<string[]> {
    const needle = foldArabic(term);
    if (needle.trim().length < 2 || !/[؀-ۿ]/u.test(needle)) return [];
    const folded = `%${escapeLike(needle)}%`;
    const literal = `%${escapeLike(term)}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT u."id"
      FROM "app"."users" u
      WHERE lower(translate(u."name", ${FOLD_FROM}, ${FOLD_TO})) LIKE ${folded}
        AND u."name" NOT ILIKE ${literal}
        AND EXISTS (SELECT 1 FROM "app"."quiz_attempts" a WHERE a."user_id" = u."id")
      LIMIT 500
    `;
    return rows.map((row) => row.id);
  }

  /**
   * «هو غلط في إيه» — one student's paper, read by the instructor.
   *
   * ## Why this is not `AttemptService.review`
   *
   * That one is the LEARNER's route: it scopes by `userId` (you may only read
   * your own paper), then resolves `reviewOptions` against the review-window
   * matrix and OMITS every field the window forbids. Both behaviours are
   * exactly right for a student and exactly wrong here — the instructor is not
   * the owner of the attempt, and a quiz configured to hide answers until it
   * closes would hide them from the person who wrote them. Reusing it would
   * have meant either widening the ownership check (so a bug there leaks every
   * student's paper to every student) or teaching the window matrix about
   * roles, which is how a display preference becomes an access control.
   *
   * `ALL_FLAGS` is the whole difference. Everything else — the ordering, the
   * option shuffle, the right-answer ids — goes through the SAME
   * `toReviewQuestion` the student screen uses, so the two cannot drift into
   * disagreeing about what the paper said.
   *
   * ## `wrongOnly` is a filter, never the query
   *
   * The popup opens on the wrong answers because that is the question being
   * asked, but the payload carries the whole paper and marks each question.
   * A response that contained only the failures could not show «٣ من ١٢», and
   * the count is the context that makes the three mean anything.
   */
  async review(attemptId: string): Promise<AdminAttemptReview> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        submittedAt: true,
        rawScore: true,
        scaledScore: true,
        // The ATTEMPT's own frozen snapshot, never the quiz's live values —
        // the same reason `AttemptService.review` reads these three off the
        // attempt: a quiz edited since would restate a mark already given.
        sumMarks: true,
        gradeOutOf: true,
        passPercent: true,
        passed: true,
        user: { select: { id: true, name: true } },
        quiz: { select: { lesson: { select: { title: true } } } },
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            id: true,
            slotPosition: true,
            optionOrder: true,
            response: true,
            mark: true,
            maxMark: true,
            state: true,
            feedbackHtml: true,
            rightAnswerText: true,
            gradedAt: true,
            version: {
              select: {
                id: true,
                type: true,
                stemHtml: true,
                generalFeedbackHtml: true,
                options: {
                  orderBy: { position: 'asc' },
                  select: { id: true, bodyHtml: true, position: true, fraction: true },
                },
              },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException();

    const questions = attempt.questions.map((row) => adminQuestion(toReviewQuestion(row, ALL_FLAGS)));

    return {
      attemptId: attempt.id,
      studentId: attempt.user.id,
      studentName: attempt.user.name,
      quizTitle: attempt.quiz.lesson.title,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      rawScore: attempt.rawScore === null ? null : Number(attempt.rawScore),
      scaledScore: attempt.scaledScore === null ? null : Number(attempt.scaledScore),
      gradeOutOf: Number(attempt.gradeOutOf),
      sumMarks: Number(attempt.sumMarks),
      passPercent: Number(attempt.passPercent),
      passed: attempt.passed,
      questions,
      // Counted from the SAME array the screen renders, so the headline and
      // the list can never disagree.
      //
      // ⚠️ An explicit list of three and NOT `!== 'correct'`. `needsGrading`
      // and `pending` are an essay sitting in the marking queue — nobody has
      // decided yet whether it is wrong, and counting them here would report
      // «٥ غلط» on a paper with five unmarked essays and no mistakes on it,
      // which is the opposite of what the screen is for. `unanswered` IS
      // counted: a blank did not earn the mark, and «غلط في إيه» means exactly
      // that.
      wrongCount: questions.filter((q) => WRONG.has(q.correctness)).length,
      totalCount: questions.length,
    };
  }

}
