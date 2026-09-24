import { z } from '@ayman/contracts/zod';

/**
 * «كود الفتح» — the student's half. Six characters an admin sends over
 * WhatsApp; typing it opens exactly what the admin picked (a lecture, a unit,
 * a term, a month, or the whole course), once, for whoever types it first.
 *
 * The admin's half lives in `./admin/unlock-codes` and must never be imported
 * from a student module.
 */

/**
 * The guardian code's alphabet — no `0/O` and no `1/I/L`, because the student
 * reads this off a WhatsApp message and types it into a phone, and those are
 * the letters fonts make identical. The database enforces the same set
 * (`unlock_codes_code_shape`).
 */
export const UNLOCK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const UNLOCK_CODE_LENGTH = 6;

const UNLOCK_CODE_SHAPE = new RegExp(`^[${UNLOCK_CODE_ALPHABET}]{${UNLOCK_CODE_LENGTH}}$`);

/**
 * What the student typed, normalised before it is judged.
 *
 * ⚠️ Upper-cased first: phone keyboards start lower-case, and a correct code in
 * small letters is the same code. Spaces and dashes go too — a pasted code
 * brings a trailing space, and an admin may send it as `ABC-123` to be read
 * aloud.
 */
export function normaliseUnlockCode(value: string): string {
  return value.replace(/[\s\-_.]+/g, '').toUpperCase();
}

export function isUnlockCodeShape(value: string): boolean {
  return UNLOCK_CODE_SHAPE.test(value);
}

export const UnlockCodeSchema = z
  .string()
  .max(40)
  .transform(normaliseUnlockCode)
  .refine(isUnlockCodeShape, 'الكود ٦ حروف وأرقام');

export const RedeemUnlockCodeSchema = z.object({ code: UnlockCodeSchema }).strict();
export type RedeemUnlockCodeInput = z.infer<typeof RedeemUnlockCodeSchema>;

/**
 * WHAT a code opens, one entry per piece. `course` is «الكورس كله»; the rest
 * name a term, a curriculum month, a unit (`CourseSection`) or one lecture.
 */
export const UnlockTargetKindSchema = z.enum(['course', 'term', 'month', 'section', 'lesson']);
export type UnlockTargetKind = z.infer<typeof UnlockTargetKindSchema>;

export const UnlockOpenedItemSchema = z.object({
  kind: UnlockTargetKindSchema,
  title: z.string(),
  /** Published lectures this piece opens right now — `1` for a lecture. */
  lessonCount: z.number().int().min(0),
  /** Where «ابدأ» on this row lands: its first published lecture, or `null`
   *  when it has none yet (a unit the instructor has not filled). */
  lessonId: z.uuid().nullable(),
});
export type UnlockOpenedItem = z.infer<typeof UnlockOpenedItemSchema>;

export const UnlockCourseRefSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
});

export const RedeemUnlockCodeResponseSchema = z.object({
  code: z.string(),
  course: UnlockCourseRefSchema,
  opened: z.array(UnlockOpenedItemSchema),
  /** The first lecture of the first piece — the success screen's main button. */
  startLessonId: z.uuid().nullable(),
});
export type RedeemUnlockCodeResponse = z.infer<typeof RedeemUnlockCodeResponseSchema>;

/**
 * Why a code was refused. Sent as the 4xx body's `message`, and each one is a
 * different sentence to the student:
 *
 * - `invalid`  — no such code. Also what a mistyped one reads as.
 * - `used`     — somebody (maybe this student, on another device) already
 *                redeemed it. «الكود ده اتستخدم قبل كده».
 * - `revoked`  — the admin cancelled it before it was used.
 * - `course_unavailable` — the course is not published. The code is NOT spent.
 * - `locked`   — too many wrong tries; comes with `Retry-After`.
 */
export const RedeemUnlockCodeErrorSchema = z.enum([
  'invalid',
  'used',
  'revoked',
  'course_unavailable',
  'locked',
]);
export type RedeemUnlockCodeError = z.infer<typeof RedeemUnlockCodeErrorSchema>;

/** One code this student redeemed, for «الحاجات اللي فتحتها بكود». */
export const MyUnlockCodeSchema = z.object({
  code: z.string(),
  redeemedAt: z.iso.datetime(),
  course: UnlockCourseRefSchema,
  opened: z.array(UnlockOpenedItemSchema),
  /** The admin pulled it — shown struck through, never hidden: the student
   *  remembers typing it and a vanished row is a support call. */
  revoked: z.boolean(),
});
export type MyUnlockCode = z.infer<typeof MyUnlockCodeSchema>;

export const MyUnlockCodesSchema = z.object({ items: z.array(MyUnlockCodeSchema) });
export type MyUnlockCodes = z.infer<typeof MyUnlockCodesSchema>;
