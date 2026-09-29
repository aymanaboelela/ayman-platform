import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';

/**
 * «نقوّي النقط دي»، «إنجازاتك» and «نصيحة اليوم» — the same tripwire
 * `results-voice.spec.ts` carries for «نتائجي», over the three dashboard
 * blocks that were redrawn together.
 *
 * They shipped with a heading that was a masculine imperative («ذاكر ده»),
 * a label that was a masculine adjective about the reader («متمكّن في:»),
 * a badge hint that only works on a boy («خُد ٩٠٪») and seven tips out of ten
 * addressed to a boy («ذاكر الحاجة اللي مذاكرتش فيها»، «افتح الدرس اللي واقف
 * عنده»، «قارن نفسك»، «استمر»…). The platform never asks, and half the
 * students reading their own home screen are girls.
 *
 * Whole tokens only, like its siblings: it is a tripwire, not a proof. The
 * list is the results screen's plus every form these blocks actually used.
 */
const MASCULINE_ONLY = new Set([
  // The forms these three blocks shipped with.
  'ذاكر',
  'مذاكرتش',
  'متمكّن',
  'متمكن',
  'خُد',
  'افتح',
  'واقف',
  'ارجع',
  'تهت',
  'قارن',
  'متقارنش',
  'استمر',
  'تذاكر',
  'تفتح',
  'تقفله',
  'تقول',
  'تتخيل',
  'تدخل',
  'تفهمه',
  'شوفه',
  'متسيبوش',
  // Second person, past — the feminine grows a ي.
  'دخلت',
  'عدّيت',
  'جبت',
  'خلصت',
  'خلّصت',
  'ذاكرت',
  'غلطت',
  'نجحت',
  'مدخلتش',
  // Imperatives.
  'حاول',
  'جرّب',
  'راجع',
  'ادخل',
  'شوف',
  'خد',
  'كمّل',
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

/** Every string under a copy subtree, with the key path it lives at. */
function lines(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => lines(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => lines(item, `${path}.${key}`));
  }
  return [];
}

const BLOCKS = [
  ...lines(copy.dashboard.mastery, 'dashboard.mastery'),
  ...lines(copy.dashboard.badges, 'dashboard.badges'),
  ...lines(copy.dashboard.tipOfDay, 'dashboard.tipOfDay'),
  ['dashboard.tipOfDayTitle', copy.dashboard.tipOfDayTitle] as [string, string],
];

describe('the dashboard’s study blocks’ voice', () => {
  it('scans something', () => {
    // A tripwire over an empty list passes forever — ten tips alone.
    expect(BLOCKS.length).toBeGreaterThan(20);
  });

  it('never addresses the student as a boy', () => {
    for (const [path, line] of BLOCKS) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${path} only works on a male reader: ${line}`).toBe(
          false,
        );
      }
    }
  });

  it('keeps the weak-topics card an opportunity, not a charge sheet', () => {
    // The card lists marks still to be WON. The words below turn it back into
    // the red list it was.
    for (const word of ['ضعف', 'ضعيف', 'راسب', 'فشل']) {
      expect(copy.dashboard.mastery.title).not.toContain(word);
      expect(copy.dashboard.mastery.lead).not.toContain(word);
      expect(copy.dashboard.mastery.emptyBody).not.toContain(word);
    }
  });
});
