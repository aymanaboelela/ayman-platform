import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy/wa-bot';

/**
 * «الرد الآلي» speaks from the instructor's own number to a student, a
 * parent, or a stranger — and it never knows which, let alone boy or girl.
 * Every line it can send, and every label on its admin screens, is held to the
 * same tripwire the checkouts carry (`checkout-voice.spec.ts`).
 *
 * Whole tokens only: a tripwire, not a proof.
 */
const MASCULINE_ONLY = new Set([
  'حوّل', 'حول', 'اكتب', 'ارفع', 'اضغط', 'حوّلت', 'حولت', 'هتحوّل', 'غيّر', 'اختار', 'استنى',
  'اسأل', 'اشترك', 'مشترك', 'كنت', 'خلصت', 'ترجع', 'تكمل', 'اتأكد', 'حاول', 'جرب', 'جرّب',
  'كمّل', 'كمل', 'ادخل', 'شوف', 'خد', 'ابدأ', 'دوس', 'إنت', 'انت', 'معاك', 'ليك', 'بيك',
  'عليك', 'عاوز', 'عايز', 'تقدر', 'هتلاقي', 'ابعت', 'كلمنا', 'اتواصل',
]);

function lines(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => lines(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => lines(item, `${path}.${key}`));
  }
  return [];
}

const ALL = lines(copy, 'waBot');

describe('the WhatsApp bot’s voice', () => {
  it('scans something', () => {
    expect(ALL.length).toBeGreaterThan(100);
  });

  it('never addresses the reader as a boy', () => {
    for (const [path, line] of ALL) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}\n•]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${path} only works on a male reader: ${line}`).toBe(false);
      }
    }
  });

  it('quotes no price and no phone number — those are read live', () => {
    for (const [path, line] of ALL) {
      expect(/\d{2,}\s*جنيه/u.test(line), `${path} hard-codes a price: ${line}`).toBe(false);
      expect(/01[0125]\d{8}/u.test(line), `${path} hard-codes a phone: ${line}`).toBe(false);
    }
  });

  it('every placeholder an answer uses is one the screen documents', () => {
    const documented = new Set<string>(copy.placeholders.map(([token]) => token));
    for (const [path, line] of lines(copy.answers, 'answers')) {
      for (const token of line.match(/\{\{[^{}]+\}\}/gu) ?? []) {
        expect(documented.has(token), `${path} uses ${token}, which the admin screen never explains`).toBe(true);
      }
    }
  });
});
