import { describe, expect, it } from 'vitest';
import { SUBJECTS } from '../subjects';
import { fillSubject, subjectCopy } from './subject';

/**
 * The neutral copy is read on stacks nobody on this team proof-reads in
 * Arabic every day — a chemistry teacher's, an Arabic teacher's — so the rules
 * its header sets out are asserted over EVERY string in it, derived by walking
 * the object rather than listed, so a line added next month is checked the day
 * it lands.
 */

/** Every string in the table, with the dotted path it lives at. */
const LINES: readonly { where: string; text: string }[] = (function collect(
  node: unknown,
  path: string[],
): { where: string; text: string }[] {
  if (typeof node === 'string') return [{ where: path.join('.'), text: node }];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => collect(value, [...path, key]));
})(subjectCopy, []);

/** The student's search queries are quoted, not written — see `subjectCopy.queries`. */
const WRITTEN = LINES.filter((line) => !line.where.startsWith('queries.'));

/**
 * The words that only work on a male reader — the same list
 * `outreach/compose.spec.ts` carries over the message pools, copied because
 * that one lives inside a `describe` and is not importable. Every entry is a
 * form that shipped in this repo once.
 */
const MASCULINE_ONLY = [
  'راجع', 'ارجع', 'اسألني', 'ابعتلي', 'ابعته', 'قولّي', 'صدّقني', 'خليك', 'خد', 'روح', 'دوس',
  'كمّل', 'اشترك', 'افتكر', 'اتفرّج', 'حلّه', 'شوف', 'ركّز', 'متخافش', 'متقلقش', 'متضايقش',
  'متزعلش', 'متقفش', 'متنساش', 'مشترك', 'مشتركتش', 'فاهم', 'ماشي', 'حابب', 'فاكر', 'متخيّل',
  'عامل', 'بتذاكر', 'تقدر', 'تستاهله', 'جبت', 'ذاكرت', 'غلطت', 'اتفرّجت', 'مشيت', 'كمّلت',
  'معاك', 'وراك', 'بيك', 'ليك', 'فيك',
  // The imperatives this table would most plausibly grow, from the onboarding
  // copy next door («اختار صفّك», «اكتب اسمك»).
  'اختار', 'اكتب', 'ادخل', 'اضغط',
];

describe('subjectCopy — the neutral twins', () => {
  it('finds the lines to check at all', () => {
    expect(LINES.length).toBeGreaterThan(30);
  });

  it('says nothing about code', () => {
    // The whole point of the table: a template that says «سطر كود» on a
    // chemistry teacher's site is the bug it exists to close.
    for (const { where, text } of LINES) {
      expect(text, `${where}: ${text}`).not.toMatch(
        /برمج|كود|بايثون|Python|JavaScript|علوم الحاسب|الذكاء الاصطناعي|متغيّر|متغير|دالة/,
      );
    }
  });

  it('names no system — a physics teacher may teach either', () => {
    for (const { where, text } of LINES) {
      expect(text, `${where}: ${text}`).not.toMatch(/بكالوريا|البكالوريا|الثانوية العامة/);
    }
  });

  it('never addresses the student as a boy', () => {
    const banned = new Set(MASCULINE_ONLY);
    for (const { where, text } of LINES) {
      for (const token of text.split(/[\s،.:؟!—«»…()٪{}]+/u)) {
        expect(banned.has(token), `«${token}» only works on a male reader — ${where}: ${text}`).toBe(
          false,
        );
      }
    }
  });

  it('never gives the teacher a gender, a title or a name', () => {
    // «مدرّس الفيزياء» and «مدرّسة الفيزياء» are two people. The role lines are
    // «{subject} — المرحلة الثانوية»; only the quoted search queries say «مدرس».
    for (const { where, text } of WRITTEN) {
      expect(text, `${where}: ${text}`).not.toMatch(/مدرّس|مدرس|مهندس|أستاذ|أيمن|ايمن/);
    }
  });

  it('never glues a preposition onto the subject — «لـالفيزياء» is not a word', () => {
    // `{subject}` carries its own article, so a letter directly in front of the
    // hole is always a broken word on the page.
    for (const { where, text } of LINES) {
      expect(text, `${where}: ${text}`).not.toMatch(/\p{L}\{subject\}/u);
    }
  });

  it('fills cleanly for every subject the platform knows', () => {
    for (const { slug, nameAr } of SUBJECTS) {
      for (const { where, text } of LINES) {
        const filled = fillSubject(text, { subject: nameAr });
        expect(filled, `${slug} / ${where}`).not.toContain('{subject}');
      }
    }
  });
});

describe('fillSubject', () => {
  it('fills every occurrence of a hole, not only the first', () => {
    expect(fillSubject('{subject} و{subject}', { subject: 'الفيزياء' })).toBe('الفيزياء والفيزياء');
  });

  it('leaves a hole it was given no value for, visibly', () => {
    expect(fillSubject('{subject} — {year}', { subject: 'الكيمياء' })).toBe('الكيمياء — {year}');
  });
});
