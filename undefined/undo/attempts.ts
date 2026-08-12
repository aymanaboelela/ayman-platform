import { z } from "zod";

/**
 * Row/response schemas ONLY. Plan 5 owns `AttemptAdminService` and every write
 * DTO behind `/api/admin/attempts` (`ReopenAttemptDto`, `GrantExtraTimeDto` in
 * `apps/api/src/modules/quiz/dto/*`) — duplicating them here would be a
 * second, driftable definition of the same wire shape. These match the ACTUAL
 * return shape of `AttemptAdminService.listAttempts`, not the illustrative
 * draft in the plan document (which used different field/state names).
 */

export const ATTEMPT_STATES = [
  "in_progress",
  "overdue",
  "submitted",
  "pending_review",
  "abandoned",
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
