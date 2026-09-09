import { z } from '@ayman/contracts/zod';
import { QuestionTypeSchema } from '@ayman/contracts/quiz/question';
import { CORRECTNESS_VALUES } from '@ayman/contracts/quiz/attempt';

/**
 * Row/response schemas ONLY. Plan 5 owns `AttemptAdminService` and every write
 * DTO behind `/api/admin/attempts` (`ReopenAttemptDto`, `GrantExtraTimeDto` in
 * `apps/api/src/modules/quiz/dto/*`) — duplicating them here would be a
 * second, driftable definition of the same wire shape. These match the ACTUAL
 * return shape of `AttemptAdminService.listAttempts`, not the illustrative
 * draft in the plan document (which used different field/state names).
 */

/**
 * How the sittings list is ordered.
 *
 * Declared HERE and not in the service so the URL parser, the dropdown and the
 * Prisma `orderBy` all read one list — a value that exists in the API and is
 * unreachable from the screen is the failure this file's siblings keep
 * recording.
 *
 * `newest` is the default: the marking queue is worked newest-first. The two
 * score orders are the addition — a paper at 30% and one at 95% need opposite
 * kinds of attention, and finding either meant reading the whole list.
 */
export const ATTEMPT_SORTS = ['newest', 'oldest', 'score_desc', 'score_asc'] as const;
export type AdminAttemptSort = (typeof ATTEMPT_SORTS)[number];

export const ATTEMPT_STATES = [
  'in_progress',
  'overdue',
  'submitted',
  'pending_review',
  'abandoned',
] as const;

export const AdminAttemptRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  studentName: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  attemptNumber: z.number().int().positive(),
  state: z.enum(ATTEMPT_STATES),
  /** 0..1 — the fraction primitive, not a percentage. */
  score: z.number().nullable(),
  startedAt: z.string(),
  submittedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
});

export type AdminAttemptRow = z.infer<typeof AdminAttemptRowSchema>;


/* ── «شوف ورقته» ──────────────────────────────────────────────────────────── */

/**
 * One question on a student's paper, as the INSTRUCTOR sees it.
 *
 * ⚠️ Every field is required here and OPTIONAL on the learner's `ReviewQuestion`,
 * and that difference is the whole point. The student's serializer omits
 * whatever the review-window matrix forbids, so its type has to make each
 * field optional; the admin route resolves every flag to `true`, so a missing
 * field would mean the question genuinely has none — not that the reader was
 * not allowed to see it. Typing it as required is what stops the popup from
 * rendering «مفيش إجابة صح» for an answer it simply was not sent.
 */
export const AdminAttemptReviewQuestionSchema = z.object({
  slotPosition: z.number().int().positive(),
  questionId: z.string(),
  attemptQuestionId: z.string(),
  type: QuestionTypeSchema,
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.string(), bodyHtml: z.string() })),
  /** The student's own stored answer. `null` when they never answered — which
   *  is a different fact from answering wrongly, and `correctness` below keeps
   *  them apart. */
  response: z.unknown().nullable(),
  /** The SAME union the learner's review screen branches on — not a superset.
   *  The admin popup renders through the identical `ReviewQuestion` component,
   *  and a value it has no case for would fall through to a blank chip. */
  correctness: z.enum(CORRECTNESS_VALUES),
  mark: z.number().nullable(),
  maxMark: z.number(),
  feedbackHtml: z.string().optional(),
  generalFeedbackHtml: z.string().optional(),
  /** Display prose. Never split back apart to find the right option — that is
   *  what `rightAnswerOptionIds` is for, and the reason it exists (I9). */
  rightAnswerText: z.string().optional(),
  /** The correct options' own ids, for the per-option highlight. */
  rightAnswerOptionIds: z.array(z.string()).optional(),
});
export type AdminAttemptReviewQuestion = z.infer<typeof AdminAttemptReviewQuestionSchema>;

/**
 * `GET /api/admin/attempts/:id/review` — «هو غلط في إيه».
 *
 * The WHOLE paper, with each question marked, and never only the failures:
 * «٣ غلط» is a number that needs «من ١٢» beside it to mean anything, and a
 * payload filtered down to the wrong ones cannot supply the denominator.
 */
export const AdminAttemptReviewSchema = z.object({
  attemptId: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  quizTitle: z.string(),
  submittedAt: z.string().nullable(),
  rawScore: z.number().nullable(),
  scaledScore: z.number().nullable(),
  gradeOutOf: z.number(),
  sumMarks: z.number(),
  passPercent: z.number(),
  passed: z.boolean().nullable(),
  questions: z.array(AdminAttemptReviewQuestionSchema),
  /** Anything that did not score full marks, blanks included — see the
   *  service's own note on why an unanswered question counts here. */
  wrongCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
});
export type AdminAttemptReview = z.infer<typeof AdminAttemptReviewSchema>;
