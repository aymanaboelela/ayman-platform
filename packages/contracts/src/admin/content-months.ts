import { z } from '@ayman/contracts/zod';
import { partialWithoutDefaults } from '@ayman/contracts/partial';
import { CourseMonthWriteSchema } from '@ayman/contracts/months';

/**
 * The ADMIN-only half of «شهور المنهج» — the two refusal shapes and the patch
 * schema. Everything a student's screen also reads lives in
 * `@ayman/contracts/months` and is imported from there, never duplicated.
 *
 * ## Why this is a module of its own
 *
 * Same rule `months.ts`'s own header states and `partial.ts` paid for: adding
 * an export to a module a previous build already shipped pins the old,
 * export-less factory in every browser still holding a chunk from it. A new
 * path is a new module id and cannot collide. `months.ts` shipped in the
 * commit before this one, so it is now an EXISTING module.
 */

/**
 * PATCH a month — rename it, renumber it, move its date, open or close it.
 *
 * ⚠️ `partialWithoutDefaults`, never `CourseMonthWriteSchema.partial()`. A
 * plain `.partial()` keeps every `.default()` underneath it, so a rename
 * sending only `{ title }` would arrive carrying `isOpen: true` and
 * `startsOn: null` — and this month's `isOpen` is the switch that decides
 * whether a student may buy it. See `partial.ts` for the production incident
 * that rule comes from.
 */
export const CourseMonthPatchSchema = z
  .object(partialWithoutDefaults(CourseMonthWriteSchema.shape))
  .strict();
export type CourseMonthPatchInput = z.infer<typeof CourseMonthPatchSchema>;

/**
 * The 409 the open switch answers with, and the reason the whole feature stays
 * honest.
 *
 * A machine-readable `code` beside the sentence because the admin panel does
 * not render `message` — it renders `copy.admin.month.blockedByUntagged` with
 * `{n}` substituted, plus the «ورّيني المحاضرات دي» link. A bare string would
 * force the client to match on Arabic prose to tell this refusal from the
 * duplicate-`monthIndex` 409 that shares its status code.
 */
export const MONTH_OPEN_BLOCKED_CODE = 'month_blocked_by_untagged';

export const MonthOpenBlockedSchema = z.object({
  code: z.literal(MONTH_OPEN_BLOCKED_CODE),
  /** Published, non-quiz lectures of this course carrying no month at all —
   *  the `{n}` in `copy.admin.month.blockedByUntagged`. Always ≥ 1 here: at
   *  zero the switch is not refused. */
  untaggedLessonCount: z.number().int().min(1),
});
export type MonthOpenBlocked = z.infer<typeof MonthOpenBlockedSchema>;

/**
 * The 409 DELETE answers when money already points at the month.
 *
 * PERMANENT, not "try again later" — `payment_submission_months` is the record
 * of what a transfer bought, and the month side of that FK is `ON DELETE
 * RESTRICT` precisely so the row cannot be orphaned into an unexplainable
 * payment. `copy.admin.month.deleteBlockedPaid` is the sentence, and it points
 * the admin at closing the month instead.
 */
export const MONTH_DELETE_BLOCKED_CODE = 'month_delete_blocked_paid';

export const MonthDeleteBlockedSchema = z.object({
  code: z.literal(MONTH_DELETE_BLOCKED_CODE),
  /** Paid submissions naming this month. Shown so «فيه اشتراكات اتدفعت» is a
   *  number the instructor can go and look at, not an assertion. */
  paidSubmissionCount: z.number().int().min(1),
});
export type MonthDeleteBlocked = z.infer<typeof MonthDeleteBlockedSchema>;

/**
 * «الناس القديمة» — what happens to the students who bought «٣ شهور» before
 * the package came off the shelf.
 *
 * The instructor's own answer: «هيشوفوا محاضرات الشهر الأول والشهر التاني
 * والشهر التالت». So a quarterly buyer is GIVEN months 1, 2 and 3 — given, not
 * converted. Nothing is revoked, nothing is updated, no `valid_until` moves:
 * their existing course-wide grant stays live until the date they paid through,
 * and these three grants are still theirs afterwards.
 *
 * ## Why this is a button and not a migration
 *
 * A migration runs on every stack at boot, before the instructor has created a
 * single month — there would be no months 1, 2 and 3 to grant. It also cannot
 * be looked at first. This runs per course, after the months exist, and
 * `dryRun` is what puts the numbers on screen before anything is written.
 */
export const LegacyMonthBackfillSchema = z
  .object({
    /** `true` counts and writes nothing — the default, so a mis-wired client
     *  cannot grant access by omission. */
    dryRun: z.boolean().default(true),
  })
  .strict();
export type LegacyMonthBackfillInput = z.infer<typeof LegacyMonthBackfillSchema>;

export const LegacyMonthBackfillResultSchema = z.object({
  /** Distinct students with an approved «٣ شهور» payment on this course and a
   *  live course-wide grant to go with it. */
  students: z.number().int().min(0),
  /** The month ids they were given — months 1, 2 and 3, in that order. */
  monthIds: z.array(z.uuid()),
  /** Grants actually written. Below `students × 3` whenever somebody already
   *  held one of the three: the backfill never writes a second live grant for
   *  a month a student already has. `0` on a dry run. */
  grantsWritten: z.number().int().min(0),
  /** `true` when nothing was written because this was a dry run. */
  dryRun: z.boolean(),
});
export type LegacyMonthBackfillResult = z.infer<typeof LegacyMonthBackfillResultSchema>;
