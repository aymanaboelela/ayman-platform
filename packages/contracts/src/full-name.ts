import { z } from '@ayman/contracts/zod';

/**
 * The student's name, as the register form, the onboarding wizard and «بياناتك»
 * all take it — and as `/sign-up/email` re-checks it on the server.
 *
 * ## Why a rule at all
 *
 * It was `min(2)`, so «aa», «11» and «احمد» all made accounts. The name is read
 * by a human at exactly the moments it matters — a parent ringing about their
 * child, an admin matching a transfer screenshot, the certificate — and at
 * those moments a first name alone does not tell two «أحمد» apart. Three parts
 * (the student, the father, the grandfather) is what a school form asks for,
 * so it is what this asks for.
 *
 * ## What it accepts
 *
 *   · at least three parts, each at least two letters — an initial is not a
 *     name, and «أ.» is how a single letter usually arrives;
 *   · Arabic letters (with or without تشكيل), OR English letters — one or the
 *     other for the whole name, never mixed, and no digits or symbols;
 *   · whitespace is tidied rather than refused: runs collapse to one space and
 *     the ends are trimmed, and ـ (تطويل) is dropped. None of those changes the
 *     name, and refusing «أحمد  محمد» over a double space would only teach a
 *     student that the form is hostile.
 *
 * «عبد الرحمن» counts as two parts. Nothing can tell a compound name from two
 * names, and erring that way costs nobody an account.
 *
 * Deliberately `.transform().pipe()` and not `z.preprocess` — the input type has
 * to stay `string` for react-hook-form; see `OptionalAuthEmailSchema` in
 * `./auth` for the same call.
 */
export const FULL_NAME_MIN_PARTS = 3;
export const FULL_NAME_MAX_LENGTH = 120;

export const FULL_NAME_ERRORS = {
  required: 'الاسم الكامل مطلوب',
  tooLong: 'الاسم طويل جدًا',
  characters: 'الاسم يتكتب بالحروف بس، من غير أرقام أو رموز',
  mixed: 'الاسم يتكتب كله بالعربي أو كله بالإنجليزي',
  tooFewParts: 'الاسم لازم يكون ثلاثي على الأقل',
  shortPart: 'كل جزء في الاسم لازم يكون حرفين على الأقل',
} as const;

/**
 * `Script_Extensions`, not `Script`: تشكيل (U+064B–U+0652) is script
 * «Inherited» and only lists Arabic in its extensions, so `Script=Arabic` would
 * refuse «محمّد». The `[\p{L}\p{M}]` half is what keeps Arabic digits (٠–٩)
 * and punctuation (، ؛ ؟), which share the script, out.
 */
const ARABIC_PART = /^(?:(?=\p{Script_Extensions=Arabic})[\p{L}\p{M}])+$/u;
const LATIN_PART = /^[A-Za-z]+$/;
const LETTER = /\p{L}/gu;

export function normalizeFullName(value: string): string {
  return value.replace(/ـ/g, '').replace(/\s+/g, ' ').trim();
}

/** The first thing wrong with an already-normalised name, or `null`. */
export function fullNameProblem(name: string): string | null {
  if (name === '') return FULL_NAME_ERRORS.required;
  if (name.length > FULL_NAME_MAX_LENGTH) return FULL_NAME_ERRORS.tooLong;
  const parts = name.split(' ');
  const arabic = parts.every((part) => ARABIC_PART.test(part));
  const latin = parts.every((part) => LATIN_PART.test(part));
  if (!arabic && !latin) {
    const eachIsOne = parts.every((part) => ARABIC_PART.test(part) || LATIN_PART.test(part));
    return eachIsOne ? FULL_NAME_ERRORS.mixed : FULL_NAME_ERRORS.characters;
  }
  if (parts.length < FULL_NAME_MIN_PARTS) return FULL_NAME_ERRORS.tooFewParts;
  if (parts.some((part) => (part.match(LETTER)?.length ?? 0) < 2)) {
    return FULL_NAME_ERRORS.shortPart;
  }
  return null;
}

export const FullNameSchema = z
  .string({ error: FULL_NAME_ERRORS.required })
  .transform(normalizeFullName)
  .pipe(
    z.string().superRefine((name, ctx) => {
      const problem = fullNameProblem(name);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
  );
