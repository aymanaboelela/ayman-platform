import { z } from '@ayman/contracts/zod';

/**
 * «كود ولي الأمر» — ٢٦ حرف من أبجدية ٣٢ حرف.
 *
 * الأبجدية ناقصة `0/O` و`1/I/L` عن قصد: الابن بيقرا الكود من الشاشة والأب
 * بيكتبه في تليفون، والحروف دي بتتلخبط في الخطوط. اقرا `StudentProfile
 * .guardianCode`.
 *
 * ⚠️ `toUpperCase` **قبل** الفحص: الأب بيكتب في تليفون فيه كيبورد بيبدأ
 * صغير، وكود صح مكتوب بحروف صغيرة كان هيترفض — وهو نفس الكود بالظبط.
 * والمسافات بتتشال لأن النسخ واللصق بيجيب واحدة في الآخر كتير.
 */
export const GUARDIAN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GUARDIAN_CODE_LENGTH = 26;

export const GuardianCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, '').toUpperCase())
  .refine(
    (value) => new RegExp(`^[${GUARDIAN_CODE_ALPHABET}]{${GUARDIAN_CODE_LENGTH}}$`).test(value),
    'الكود مش مظبوط',
  );

export const GuardianSignInSchema = z.object({ code: GuardianCodeSchema }).strict();
export type GuardianSignIn = z.infer<typeof GuardianSignInSchema>;
