import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';

/**
 * «نتائجي» — the same tripwire `outreach/compose.spec.ts` and
 * `homework.spec.ts` carry, over the results screen's own strings.
 *
 * This screen shipped with three forms that only a boy can be addressed with —
 * «امتحانات دخلتها»، «امتحانات نجحت فيها»، «لسه مدخلتش أي امتحان» — and a
 * legend that said «محاولة عدّيتها». Half the students reading it are girls,
 * and the platform never asks which, so every one of those told her the page
 * was written for somebody else. They are listed below by name so the exact
 * regression cannot come back, alongside the imperatives the other two
 * tripwires already ban.
 *
 * Whole tokens only, like its siblings: it is a tripwire, not a proof.
 */
const MASCULINE_ONLY = new Set([
  // The four that shipped here.
  'دخلتها',
  'نجحت',
  'مدخلتش',
  'عدّيتها',
  // Second person, past — the feminine grows a ي: «دخلتي»، «عدّيتي».
  'دخلت',
  'عدّيت',
  'جبت',
  'خلصت',
  'ذاكرت',
  'غلطت',
  // Imperatives. «حاول تاني» is the one a results screen reaches for first.
  'حاول',
  'جرّب',
  'راجع',
  'ادخل',
  'شوف',
  'خد',
  'كمّل',
  'ذاكر',
  // Adjectives said ABOUT the reader.
  'ناجح',
  'راسب',
  'شاطر',
  'فاهم',
  // Pronouns that grow a ي.
  'معاك',
  'ليك',
  'بيك',
  'عليك',
]);

describe('the results screen’s voice', () => {
  it('never addresses the student as a boy', () => {
    for (const [key, line] of Object.entries(copy.results)) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in results.${key} only works on a male reader: ${line}`).toBe(
          false,
        );
      }
    }
  });

  it('keeps the low band a place on a road, never a verdict', () => {
    // The average is not a pass/fail — every exam has its own mark — so the
    // label under a low one must not read as one.
    for (const word of ['راسب', 'فشل', 'ضعيف']) {
      expect(copy.results.bandLow).not.toContain(word);
      expect(copy.results.moodLow).not.toContain(word);
    }
  });
});
