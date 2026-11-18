import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { copy as adminCopy } from '@ayman/contracts/copy/admin';
import { dailyEssayCopy } from './daily-essay';

/**
 * The same tripwire `engagement-voice.spec.ts` carries, over «السؤال المقالي
 * اليومي» — BOTH halves. The student's page for the usual reason (the platform
 * never asks boy or girl), and the marker's screens because the canned notes
 * on them are sentences sent to a student, and the rest follows the rule the
 * whole dashboard does (CLAUDE.md §7).
 */
const MASCULINE_ONLY = new Set([
  'ذاكر', 'مذاكرتش', 'خُد', 'افتح', 'واقف', 'ارجع', 'قارن', 'استمر', 'تذاكر', 'تفتح', 'تقول', 'تدخل',
  'دخلت', 'جبت', 'خلصت', 'خلّصت', 'ذاكرت', 'غلطت', 'نجحت', 'جاوبت', 'كتبت', 'اخترت',
  'حاول', 'جرّب', 'راجع', 'ادخل', 'شوف', 'خد', 'كمّل', 'جاوب', 'اختار', 'اكتب', 'اضغط', 'دوس', 'ابدأ',
  // «حل» is not here: unvocalised it is also the noun («من غير حل»).
  'صوّر', 'ارفع', 'ابعت', 'سلّم', 'صحّح', 'احفظ', 'احذف', 'ضيف',
  'ناجح', 'راسب', 'شاطر', 'فاهم', 'جاهز', 'مستعد',
  'معاك', 'ليك', 'بيك', 'عليك', 'إنت', 'انت', 'وانت', 'مستنيك',
]);

function lines(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => lines(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => lines(item, `${path}.${key}`));
  }
  return [];
}

const SCREENS: Array<[string, string]> = [
  ...lines(dailyEssayCopy, 'dailyEssay'),
  ['nav.essay', copy.nav.essay],
  ['admin.nav.essays', adminCopy.admin.nav.essays],
  ['notifications.essayMarked', copy.notifications.essayMarked],
  ['notifications.essayMarkedDetail', copy.notifications.essayMarkedDetail],
  ['notifications.essaySubtitle', copy.notifications.essaySubtitle],
];

describe('the daily essay screens', () => {
  it('scans something', () => {
    expect(SCREENS.length).toBeGreaterThan(120);
  });

  it('never addresses the reader, or describes the student, in the masculine', () => {
    for (const [path, line] of SCREENS) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}/]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${path} only works on a male reader: ${line}`).toBe(false);
      }
    }
  });

  it('names no teacher, so nothing here needs a tenant gate', () => {
    for (const [path, line] of SCREENS) {
      expect(/[أا]يمن|Ayman/i.test(line), `${path} names the teacher: ${line}`).toBe(false);
    }
  });
});
