import { describe, expect, it } from 'vitest';
import { arabicCount, type ArabicCountForms } from '@ayman/contracts/arabic-count';
import { copy } from '@ayman/contracts/copy/admin';
import { adminAccount } from '@ayman/contracts/copy/admin-account';
import { adminGrading } from '@ayman/contracts/copy/admin-grading';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { practiceCopy } from '@ayman/contracts/copy/practice';
import { adminPractice } from '@ayman/contracts/copy/admin-practice';

/**
 * The quiz surfaces' voice — the same tripwire `results-voice.spec.ts` and
 * `dashboard-voice.spec.ts` carry, over every string a student reads while
 * sitting, submitting and reviewing a paper, and every string the instructor
 * reads while marking it.
 *
 * The 2026-10-15 redesign shipped these screens with «لسه معاك وقت كافي»،
 * «اقعد راجع وخد وقتك كويس، وتأكد من إجاباتك»، «فخور بيك»، «عاش يا بطل»،
 * «استمر»، and the table under them already said «جاوبت»، «مجاوبتش»، «علّم
 * السؤال»، «حلّه وانت مركّز» and «ناجح». Every one of those only works on a
 * male reader; the platform never asks, and half the students are girls.
 * They are listed by name below so that exact regression cannot come back.
 *
 * Whole tokens only, like its siblings: a tripwire, not a proof.
 */
const MASCULINE_ONLY = new Set([
  // What the redesign wrote inline.
  'معاك',
  'اقعد',
  'خد',
  'تأكد',
  'بيك',
  'بطل',
  'استمر',
  'راجعها',
  'اعرف',
  'عيد',
  'تعوض',
  'اختر',
  'ترغب',
  'لديك',
  'تجب',
  'أجبت',
  'سلّم',
  'صحّح',
  'امتحن',
  // What the table under it said.
  'جاوبت',
  'مجاوبتش',
  'علّم',
  'شيل',
  'شيله',
  'حطه',
  'حلّه',
  'وانت',
  'انت',
  'إنت',
  'مركّز',
  'ناجح',
  'هتقدر',
  'تقدر',
  'حرّك',
  // The admin screen's, which is read by more than one person now.
  'احفظ',
  'اضغط',
  'اكتب',
  'أعد',
  'رتّب',
  'صحّحتها',
  'مصحّحتش',
  'ساب',
  'واخد',
  'متأكد',
  'عايز',
  // The usual imperatives and second-person forms the sibling specs ban.
  'راجع',
  'ارجع',
  'شوف',
  'جرّب',
  'حاول',
  'ادخل',
  'افتح',
  'كمّل',
  'ذاكر',
  'دوس',
  'ركّز',
  'متقلقش',
  'متخافش',
  'غلطت',
  'جبت',
  'خلصت',
  'ذاكرت',
  'دخلت',
  'نجحت',
  'عدّيت',
  'راسب',
  'شاطر',
  'فاهم',
  'ليك',
  'عليك',
  'فيك',
  'وراك',
]);

/** Every string in a nested copy table, with the path it was found at. */
function lines(node: unknown, path: string): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((item, index) => lines(item, `${path}[${index}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) => lines(value, `${path}.${key}`));
  }
  return [];
}

const TABLES: Array<[string, unknown]> = [
  ['quiz', copy.quiz],
  ['examGate', copy.examGate],
  ['quizExperience', quizExperience],
  ['adminGrading', adminGrading],
  ['adminAccount', adminAccount],
  ['admin.grading', copy.admin.grading],
  ['admin.profile', copy.admin.profile],
  // The public self-test: read by a visitor the platform knows nothing about.
  ['practice', practiceCopy],
  // Its dashboard: read by the instructor and by every assistant given
  // `question:write`, so it addresses nobody either.
  ['adminPractice', adminPractice],
];

describe('the quiz surfaces’ voice', () => {
  it('never addresses the reader — or describes the student — as a boy', () => {
    const offenders: string[] = [];
    for (const [name, table] of TABLES) {
      for (const [path, line] of lines(table, name)) {
        for (const token of line.split(/[\s،,.:؟?!—–«»…()٪%{}[\]/·]+/u)) {
          if (MASCULINE_ONLY.has(token)) offenders.push(`«${token}» in ${path}: ${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('carries no emoji — every mark on these screens is a lucide icon', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const offenders = TABLES.flatMap(([name, table]) =>
      lines(table, name).filter(([, line]) => emoji.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});

describe('counted nouns on the quiz surfaces', () => {
  const q = quizExperience.counts.questions;

  it('says the number of questions the way it is said', () => {
    expect(arabicCount(1, q)).toBe('سؤال واحد');
    expect(arabicCount(2, q)).toBe('سؤالين');
    expect(arabicCount(3, q)).toBe('3 أسئلة');
    expect(arabicCount(10, q)).toBe('10 أسئلة');
    expect(arabicCount(11, q)).toBe('11 سؤال');
    expect(arabicCount(20, q)).toBe('20 سؤال');
  });

  it('agrees the submit dialog’s headline with its count', () => {
    const forms = quizExperience.submit.unanswered;
    expect(arabicCount(1, forms)).toBe('لسه فيه سؤال واحد من غير إجابة');
    expect(arabicCount(2, forms)).toBe('لسه فيه سؤالين من غير إجابة');
    expect(arabicCount(3, forms)).toBe('لسه فيه 3 أسئلة من غير إجابة');
    expect(arabicCount(11, forms)).toBe('لسه فيه 11 سؤال من غير إجابة');
  });

  it('says the minutes left the way the clock would be read out', () => {
    const forms = quizExperience.submit.timeLeft;
    expect(arabicCount(1, forms)).toBe('فاضل دقيقة واحدة');
    expect(arabicCount(2, forms)).toBe('فاضل دقيقتين');
    expect(arabicCount(5, forms)).toBe('فاضل 5 دقايق');
    expect(arabicCount(25, forms)).toBe('فاضل 25 دقيقة');
  });

  it('puts the number in every plural form, and never in one and two', () => {
    // A `few`/`many` form without `{count}` prints a sentence with no number
    // in it; a `one`/`two` form WITH one prints «1 سؤال واحد».
    const groups = lines(quizExperience, 'quizExperience')
      .map(([path]) => path.replace(/\.(one|two|few|many)$/, ''))
      .filter((path, index, all) => all.indexOf(path) === index);
    const formGroups = groups
      .map((path) => [path, resolve(quizExperience, path.replace(/^quizExperience\.?/, ''))] as const)
      .filter((entry): entry is readonly [string, ArabicCountForms] => isForms(entry[1]));

    expect(formGroups.length).toBeGreaterThan(5);
    for (const [path, forms] of formGroups) {
      expect(forms.few, path).toContain('{count}');
      expect(forms.many, path).toContain('{count}');
      expect(forms.one, path).not.toContain('{count}');
      expect(forms.two, path).not.toContain('{count}');
    }
  });
});

function resolve(root: unknown, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), root);
}

function isForms(value: unknown): value is ArabicCountForms {
  return (
    !!value &&
    typeof value === 'object' &&
    ['one', 'two', 'few', 'many'].every((key) => typeof (value as Record<string, unknown>)[key] === 'string')
  );
}
