import { z } from 'zod';

/**
 * Deliberately minimal shape for `GET /api/profile/me` — only the fields the
 * client actually needs to make a routing decision (mainly
 * `onboardingCompleted`, used right after login/register to send a student
 * to `/onboarding` or past it). `profile` itself is the full `StudentProfile`
 * row on the API side; re-declaring its exact shape here isn't needed for
 * that decision, so it's left as an opaque nullable value rather than
 * duplicated field-by-field. A future task that needs to *read* profile
 * fields on the client should extend this schema then, not before.
 *
 * No relative imports here either, for the same reason as `auth.ts` and
 * `onboarding.ts` — see those files' comments.
 */
export const ProfileMeSchema = z.object({
  userId: z.string(),
  onboardingCompleted: z.boolean(),
  /**
   * Still the whole `StudentProfile` row and still deliberately not mirrored
   * field-by-field — `looseObject` keeps every key the API sends, typed or
   * not. Exactly one field is named, because exactly one is read on the
   * client: the dashboard greets the student by name. `fullName` is NOT NULL
   * in the database, but it is `.optional()` here anyway so that a profile
   * shape which somehow arrives without it degrades to the generic greeting
   * instead of failing the whole dashboard's `schema.parse`.
   */
  profile: z.looseObject({ fullName: z.string().optional() }).nullable(),
});

export type ProfileMe = z.infer<typeof ProfileMeSchema>;
