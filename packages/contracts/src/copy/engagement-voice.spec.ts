import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { engagementCopy } from './engagement';

/**
 * The same tripwire `dashboard-voice.spec.ts` carries, over the five
 * engagement screens: whole tokens that only work on a boy. The platform never
 * asks, and half the students reading «سؤال اليوم» are girls.
 */
const MASCULINE_ONLY = new Set([
  'ذاكر', 'مذاكرتش', 'خُد', 'افتح', 'واقف', 'ارجع', 'قارن', 'استمر', 'تذاكر', 'تفتح', 'تقول', 'تدخل',
  'دخلت', 'جبت', 'خلصت', 'خلّصت', 'ذاكرت', 'غلطت', 'نجحت', 'جاوبت', 'كتبت', 'اخترت',
  'حاول', 'جرّب', 'راجع', 'ادخل', 'شوف', 'خد', 'كمّل', 'جاوب', 'اختار', 'اكتب', 'اضغط', 'دوس', 'ابدأ',
  'ناجح', 'راسب', 'شاطر', 'فاهم', 'جاهز', 'مستعد',
  'معاك', 'ليك', 'بيك', 'عليك', 'إنت', 'انت', 'وانت', 'توديك', 'مستنيك', 'سلسلتك', 'خطتك', 'ملاحظاتك',
]);

function lines(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => lines(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => lines(item, `${path}.${key}`));
  }
  return [];
}

const SCREENS = [
  ...lines(engagementCopy, 'engagement'),
  ...(['daily', 'plan', 'notes', 'badges', 'recap'] as const).map(
    (key) => [`nav.${key}`, copy.nav[key]] as [string, string],
  ),
];

describe('the engagement screens', () => {
  it('scans something', () => {
    expect(SCREENS.length).toBeGreaterThan(150);
  });

  it('never addresses the student as a boy', () => {
    for (const [path, line] of SCREENS) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${path} only works on a male reader: ${line}`).toBe(false);
      }
    }
  });
});
