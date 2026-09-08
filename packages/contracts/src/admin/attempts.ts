import { z } from '@ayman/contracts/zod';

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

