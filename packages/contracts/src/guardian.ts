import { z } from '@ayman/contracts/zod';

/**
 * «كود ولي الأمر» — ٦ خانات: حروف وأرقام ورموز، وكل كود فيه واحد من كل نوع.
 *
 * كان ٢٦ حرف، واتصغّر بطلب صاحب المنصة: الأب بيكتبه في تليفون. الأبجدية
 * ناقصة `0/O` و`1/I/L` لسه، لأن الخطوط بتلخبطهم. والتخمين مش بيتصد بالطول
 * دلوقتي، بيتصد بقفل المحاولات في `GuardianSessionService`. الكود بيتولد في
 * الداتابيز (`app.new_guardian_code()`) ومبيتكررش.
 *
 * ⚠️ `toUpperCase` **قبل** الفحص: الأب بيكتب في تليفون فيه كيبورد بيبدأ
 * صغير، وكود صح مكتوب بحروف صغيرة كان هيترفض — وهو نفس الكود بالظبط.
 * والمسافات بتتشال لأن النسخ واللصق بيجيب واحدة في الآخر كتير.
 */
export const GUARDIAN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789@#$%&*+=?';
export const GUARDIAN_CODE_LENGTH = 6;

/** The alphabet as a regex character class — the symbols need escaping. */
const GUARDIAN_CODE_SHAPE = new RegExp(
  `^[${GUARDIAN_CODE_ALPHABET.replace(/[\\\]^$*+?.()|{}[-]/g, '\\$&')}]{${GUARDIAN_CODE_LENGTH}}$`,
);

export const GuardianCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, '').toUpperCase())
  .refine((value) => GUARDIAN_CODE_SHAPE.test(value), 'الكود مش مظبوط');

export const GuardianSignInSchema = z.object({ code: GuardianCodeSchema }).strict();
export type GuardianSignIn = z.infer<typeof GuardianSignInSchema>;
