import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';

/**
 * «اشتراك الكورس» and «طلبك» — the two checkouts, held to the tripwire
 * `dashboard-voice.spec.ts` and `results-voice.spec.ts` carry for their
 * screens.
 *
 * The course checkout shipped with a transfer paragraph written to a boy —
 * «حوّل المبلغ… وبعدين اكتب رقم الموبايل اللي حوّلت منه وارفع صورة» — over
 * an uploader that said «اضغط هنا وارفع», a heading that asked «هتحوّل بإيه؟»
 * and errors that told him to «حاول تاني» and «استنى». The platform never asks
 * boy or girl, and half the students paying are girls: each of those told her
 * the screen was written for somebody else, on the one screen where she is
 * deciding whether to send money. They are listed by name so the exact
 * regression cannot come back.
 *
 * The WHOLE `subscribe` object, not a key list — a new line added to the
 * checkout is covered the day it lands. The book checkout shares most of its
 * payment step with it (`senderPhoneLabel`, `screenshotLabel`, `railChange`…);
 * its own chrome and payment-step keys are listed below.
 *
 * Whole tokens only, like its siblings: it is a tripwire, not a proof.
 */
const MASCULINE_ONLY = new Set([
  // The forms the course checkout shipped with.
  'حوّل',
  'حول',
  'اكتب',
  'ارفع',
  'اضغط',
  'حوّلت',
  'حولت',
  'هتحوّل',
  'غيّر',
  'اختار',
  'استنى',
  'اسأل',
  'اشترك',
  'مشترك',
  'كنت',
  'خلصت',
  'ترجع',
  'تكمل',
  'اتأكد',
  // Imperatives the sibling tripwires already ban.
  'حاول',
  'جرب',
  'جرّب',
  'كمّل',
  'كمل',
  'ادخل',
  'شوف',
  'خد',
  'ابدأ',
  'دوس',
  // «إنت» and the pronouns that grow a ي for a girl.
  'إنت',
  'انت',
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

/** The book checkout's own words: its step bar, summary, form chrome and the
 *  payment-step messages it does not borrow from `subscribe`. */
const BOOK_CHECKOUT_KEYS = [
  'stepsLabel',
  'stepCart',
  'stepAddress',
  'stepPayment',
  'summaryTitle',
  'summaryDetails',
  'contactTitle',
  'contactLead',
  'deliveryTitle',
  'deliveryLead',
  'zoneHint',
  'totalIncludesShipping',
  'payAmountLabel',
  'copyAmount',
  'deliverTo',
  'payStepSend',
  'successTitle',
  'successBody',
  'done',
  'senderPhoneRequired',
  'screenshotRequired',
  'genericError',
  'uploadError',
  'instructions',
] as const;

const CHECKOUT = [
  ...lines(copy.subscribe, 'subscribe'),
  ...BOOK_CHECKOUT_KEYS.map((key) => [`bookOrder.${key}`, copy.bookOrder[key]] as [string, string]),
];

describe('the checkouts’ voice', () => {
  it('scans something', () => {
    // A tripwire over an empty list passes forever.
    expect(CHECKOUT.length).toBeGreaterThan(90);
  });

  it('never addresses the student as a boy', () => {
    for (const [path, line] of CHECKOUT) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪%{}]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${path} only works on a male reader: ${line}`).toBe(
          false,
        );
      }
    }
  });
});
