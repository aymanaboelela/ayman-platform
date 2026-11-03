import { describe, expect, it } from 'vitest';
import { passwordResetCopy } from '@ayman/contracts/copy/password-reset';

/**
 * «نسيت كلمة السر» — the same tripwire as `compose.spec.ts`'s, over the page,
 * the WhatsApp message and the two assistant answers.
 *
 * This copy is read by a student who is locked out and in a hurry, and the
 * reset screens are exactly where Arabic UI copy reaches for the imperative —
 * «اكتب الرقم», «تجاهل الرسالة», «غيّر كلمة السر». Every one of those is a
 * boy. Whole tokens only: a tripwire, not a proof.
 */
const MASCULINE_ONLY = new Set([
  // Imperatives a reset screen is tempted by. The feminine grows a ي.
  'اكتب',
  'ادخل',
  'اضغط',
  'دوس',
  'تجاهل',
  'غيّر',
  'غير',
  'ابعت',
  'استنى',
  'جرّب',
  'راجع',
  'افتح',
  'خد',
  'شوف',
  'كلّم',
  'كلم',
  'تواصل',
  'متقلقش',
  'متخافش',
  // Second person, present and past.
  'تقدر',
  'هتلاقي',
  'طلبت',
  'نسيت',
  'دخلت',
  // Participles about the reader.
  'متأكد',
  'فاكر',
  'عارف',
  // Pronoun suffixes that pick one.
  'ليك',
  'معاك',
  'بيك',
  'فيك',
]);

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('password reset copy', () => {
  // «نسيت كلمة السر؟» is the label everyone already knows the link by — the
  // student's own words, quoted, not the platform speaking to them. It sits in
  // «» on the assistant lines for the same reason, so quoted spans and the
  // link itself are dropped before tokenising.
  const unquoted = (line: string) =>
    line === passwordResetCopy.loginLink ? '' : line.replace(/«[^»]*»/gu, ' ');

  it('never addresses the student as a boy', () => {
    for (const line of strings(passwordResetCopy)) {
      for (const token of unquoted(line).split(/[\s،.:؟!—«»…()\n]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» only works on a male reader: ${line}`).toBe(false);
      }
    }
  });

  // No name check here on purpose: `tenant-identity-leak.spec.ts` walks this
  // file like every other, and a regex of the name in THIS file would be the
  // one thing it flagged.
  it('leaves the platform name to the caller', () => {
    expect(passwordResetCopy.message).toContain('{platform}');
  });

  it('puts the code on a line of its own, with the warning beside it', () => {
    const lines = passwordResetCopy.message.split('\n');
    expect(lines.some((line) => line.endsWith('{code}'))).toBe(true);
    expect(passwordResetCopy.message).toContain('سرّي');
  });
});
