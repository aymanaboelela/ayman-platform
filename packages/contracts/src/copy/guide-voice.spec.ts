import { describe, expect, it } from 'vitest';
import { guideCopy } from '@ayman/contracts/copy/guide';

/**
 * «مرشد الاشتراك» — the tripwire `checkout-voice.spec.ts`,
 * `password-reset-voice.spec.ts` and `outreach/compose.spec.ts` carry for
 * their own screens, over the whole guide.
 *
 * It matters more here than on any of them. This is the first thing the
 * platform says to somebody who has never used it, it says it OUT LOUD in the
 * teacher's voice, and half the students hearing it are girls. A guide is
 * exactly where Arabic copy reaches for the imperative — «اختار صفّك»، «اكتب
 * اسمك»، «حوّل المبلغ»، «ارفع الصورة» — and every one of those is a boy.
 *
 * The WHOLE `guideCopy` object, not a key list, so a line added later is
 * covered the day it lands. Whole tokens only: it is a tripwire, not a proof.
 * The list is the union of the three sibling tripwires' lists, plus the forms
 * a step-by-step guide is tempted by that none of them had cause to name.
 */
const MASCULINE_ONLY = new Set([
  // Imperatives. The feminine grows a ي — «اختاري»، «اكتبي»، «حوّلي».
  'اختار',
  'اختر',
  'اكتب',
  'ادخل',
  'اضغط',
  'دوس',
  'افتح',
  'حوّل',
  'حول',
  'ارفع',
  'ابعت',
  'انسخ',
  'صوّر',
  'استنى',
  'اسأل',
  'اسألني',
  'اشترك',
  'سجّل',
  'سجل',
  'كمّل',
  'كمل',
  'جرّب',
  'جرب',
  'حاول',
  'راجع',
  'ارجع',
  'شوف',
  'خد',
  'روح',
  'تعالى',
  'ابدأ',
  'اتأكد',
  'اتبع',
  'غيّر',
  'غير',
  'تجاهل',
  'خليك',
  'ركّز',
  'افتكر',
  'اسمع',
  'كلّم',
  'كلم',
  'تواصل',
  // Negative imperatives.
  'متخافش',
  'متقلقش',
  'متنساش',
  // Second person, present and past. «تقدري»، «هتلاقي»، «حوّلتي».
  'تقدر',
  'تحب',
  'هتدفع',
  'هتحوّل',
  'هتلاقي',
  'تكمل',
  'ترجع',
  'حوّلت',
  'حولت',
  'دفعت',
  'اشتريت',
  'سجّلت',
  'دخلت',
  'نسيت',
  'طلبت',
  'خلصت',
  'كنت',
  // Participles and adjectives said about the reader.
  'مشترك',
  'متأكد',
  'عارف',
  'فاكر',
  'فاهم',
  'جاهز',
  'عايز',
  'محتاج',
  // The pronoun, and the suffixes that pick one.
  'إنت',
  'انت',
  'معاك',
  'ليك',
  'بيك',
  'عليك',
  'فيك',
  'وراك',
]);

/** Every string under the guide's copy, with the key path it lives at. */
function lines(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => lines(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => lines(item, `${path}.${key}`));
  }
  return [];
}

const GUIDE = lines(guideCopy, 'guide');
const SPOKEN = lines(guideCopy.voice, 'guide.voice');

describe('the first-visit guide’s voice', () => {
  it('scans something', () => {
    // A tripwire over an empty list passes forever.
    expect(GUIDE.length).toBeGreaterThan(70);
    expect(SPOKEN.length).toBeGreaterThan(20);
  });

  it('never addresses the student as a boy', () => {
    for (const [path, line] of GUIDE) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${path} only works on a male reader: ${line}`).toBe(
          false,
        );
      }
    }
  });

  it('never names an instructor — the name arrives through `{name}`', () => {
    // The file is scanned by `tenant-identity-leak.spec.ts` as well; this is
    // the same promise stated where the copy lives.
    for (const [path, line] of GUIDE) {
      expect(line, path).not.toMatch(/أيمن|ايمن|أبو العلا/u);
    }
  });

  it('puts no variable data in a recorded line', () => {
    // One recording is played to every student: a price, a month or a course
    // title in it would be wrong for all but one of them. `{name}` — the
    // teacher, the same on every play — is the single placeholder allowed.
    for (const [path, line] of SPOKEN) {
      const placeholders = [...line.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      expect(placeholders.filter((name) => name !== 'name'), path).toEqual([]);
      // No digits of either kind: a number in a line is a price or a count.
      expect(line, path).not.toMatch(/[0-9٠-٩]/u);
    }
  });

  it('keys every recorded line by something that is safe as a file name', () => {
    for (const key of Object.keys(guideCopy.voice)) expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  it('keeps every recorded line to one breath', () => {
    for (const [path, line] of SPOKEN) expect(line.length, path).toBeLessThanOrEqual(160);
  });
});
