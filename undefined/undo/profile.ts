import { z } from "zod";

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
   * not. Only the fields something actually READS are named, which the
   * original version of this comment set as the rule: extend it when a screen
   * needs a field, not before.
   *
   * `/profile` (slice 3) is that screen, and it added the four below. Every
   * one is `.optional()`/`.nullable()` in the same shape the column has, so a
   * profile that arrives incomplete renders "مش متسجّل" for that row rather
   * than failing the whole page's `schema.parse`. `fullName` is NOT NULL in
   * the database and is `.optional()` here anyway for exactly that reason —
   * the dashboard degrades to a generic greeting instead of erroring.
   */
  profile: z
    .looseObject({
      fullName: z.string().optional(),
      phone: z.string().optional(),
      schoolName: z.string().nullable().optional(),
      governorateCode: z.string().optional(),
      year: z.number().int().nullable().optional(),
      /**
       * Added by `/library`, which groups the catalog by (year, track) and has
       * to know which group is the student's OWN. Both are `StudentProfile`
       * columns that the API already sends — naming them here only makes them
       * typed, it does not change the wire.
       *
       * Nullable in the same shape as the columns: a profile that stopped
       * mid-onboarding has neither, and the library renders "اختار صفّك"
       * instead of guessing a year.
       */
      systemId: z.string().nullable().optional(),
      trackId: z.string().nullable().optional(),
      /**
       * مدرسة عام ولا لغات. Named here for the same reason `trackId` was: the
       * library decides which courses are the student's OWN, and a course
       * carries `forGeneral`/`forLanguages` that only mean something next to
       * this.
       *
       * Nullable because the column is — every profile onboarded before the
       * question existed has none, and the library treats that as "no stream
       * to filter by" rather than guessing one. `.optional()` too, so an API
       * response that predates this field still parses.
       */
      schoolStream: z.enum(["general", "languages"]).nullable().optional(),
    })
    .nullable(),
});

export type ProfileMe = z.infer<typeof ProfileMeSchema>;
