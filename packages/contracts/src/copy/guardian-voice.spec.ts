import { describe, expect, it } from 'vitest';
import { guardianCopy } from '@ayman/contracts/copy/guardian';

/**
 * Parent's page — the same tripwire as `results-voice.spec.ts`, for a page
 * that talks ABOUT the student rather than TO them.
 *
 * Third person is where Egyptian Arabic genders the reader without anyone
 * noticing: «عدّى» is a boy and «عدّت» is a girl, «مشترك» / «مشتركة», «حضر» /
 * «حضرت». The page this replaced shipped «لسه ماامتحنش», «عدّى» and
 * «مامشيش» to every parent — half of whom have a daughter. And the parent is
 * not always a father, so nothing here addresses the reader with a verb either.
 *
 * Whole tokens only: a tripwire, not a proof.
 */
const GENDERED = new Set([
  // What the old page said.
  'ماامتحنش',
  'عدّى',
  'مامشيش',
  'مشترك',
  // Third-person verbs about the student, past and present.
  'امتحن',
  'نجح',
  'رسب',
  'سقط',
  'خلّص',
  'ذاكر',
  'شاف',
  'حضر',
  'غاب',
  'سلّم',
  'حل',
  'دخل',
  'اتكرّم',
  'بيذاكر',
  'بيحضر',
  // Adjectives said about the student.
  'ناجح',
  'راسب',
  'شاطر',
  'متأخر',
  'غايب',
  // The child, by the parent's relation — the name says it for both.
  'ابنك',
  'بنتك',
  'ابنه',
  'ابنها',
  'بنته',
  'بنتها',
  // Pronouns that pick one.
  'هو',
  'هي',
  'بتاعه',
  'بتاعها',
  'عليه',
  'عليها',
  // Imperatives to the parent.
  'تابع',
  'شوف',
  'راجع',
  'كلّم',
]);

function strings(value: unknown, path = 'guardian'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => strings(inner, `${path}.${key}`));
  }
  return [];
}

describe('the parent’s page voice', () => {
  it('never genders the student, and never addresses the parent with a verb', () => {
    for (const [key, line] of strings(guardianCopy)) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}#·]+/u)) {
        expect(GENDERED.has(token), `«${token}» in ${key} picks a gender: ${line}`).toBe(false);
      }
    }
  });

  it('says «لسه مفيش» where an average would be, never a zero', () => {
    expect(guardianCopy.stats.none).not.toMatch(/[0٠]/u);
  });
});
