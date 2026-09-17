import { toAsciiDigits } from '@ayman/contracts/phone';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * قراءة إيصال التحويل — «المبلغ ورقم العملية» من النص اللي الـOCR طلّعه.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure text in, two numbers out. The OCR engine itself lives in
 * `receipt-ocr.ts`; this file is the half worth testing, and it is testable
 * because it never touches an image.
 *
 * ## Why the reference matters more than the amount
 *
 * `BK-EA9B7C` and `BK-7A3FD3` are one transfer — `023031384189`, 250 EGP, to
 * `01225796476` — uploaded as two genuinely different pictures: a Vodafone-Cash
 * SMS and an InstaPay receipt. No hash of the image can see that they are the
 * same money. This can.
 *
 * ## The two receipt shapes this actually meets
 *
 *   فودافون كاش (SMS)   «تم تحويل 250 جنيه لرقم 01225796476 … مصاريف الخدمة 1
 *                        جنيه … تاريخ العملية : 10-9-2026 21:57 … رقم العملية :
 *                        023031384189»
 *
 *   إنستا باي (إيصال)    «المبلغ 250.00 جنيه · إلى 01225796476 · رسوم الخدمة
 *                        1.00 جنيه · إجمالي المبلغ المخصوم 251.00 جنيه · رقم
 *                        العملية 023031384189»
 *
 * ## Why it does not rely on the Arabic
 *
 * Arabic OCR is the least reliable part of the pipeline — «رقم العملية» comes
 * back as «رقم العمليه», «رقمالعملية» or worse depending on the compression.
 * The digits, by contrast, are Latin in both apps and read cleanly. So the
 * Arabic is only ever a HINT that raises confidence, never a requirement: the
 * shapes of the numbers themselves are what identify them.
 */

/** What one receipt says, as far as anything could tell. */
export type ReceiptReading = {
  /** «رقم العملية» — the transfer's own reference. */
  ref: string | null;
  /** The transferred amount in piastres. */
  amountCents: number | null;
};

/**
 * A transfer reference is a long run of digits — and the trap is that an
 * Egyptian mobile number is one too.
 *
 * `01225796476` is eleven digits and sits two lines above `023031384189`, which
 * is twelve. Taking "the longest run" would be right here and wrong the moment
 * a bank writes a ten-digit reference, so the phone shape is excluded
 * explicitly instead of being outrun.
 */
const EGYPTIAN_MOBILE = /^(?:0|002|\+?20)?1[0125]\d{8}$/;

/** Below ten digits it is a date, an amount, a floor number or a balance. */
const MIN_REF_DIGITS = 10;
/** Above sixteen it is a card number or two fields the OCR glued together. */
const MAX_REF_DIGITS = 16;

/**
 * The reference, or null.
 *
 * ⚠️ Ordered by POSITION, not by length. Both apps print the reference last,
 * under the date, and «رقم العملية» is the only long number after it — whereas
 * the recipient's phone is always above. When two candidates survive, the later
 * one is the reference.
 */
export function readReference(text: string): string | null {
  const digits = toAsciiDigits(text);
  const candidates: string[] = [];

  for (const match of digits.matchAll(/\d{6,}/g)) {
    const run = match[0];
    if (run.length < MIN_REF_DIGITS || run.length > MAX_REF_DIGITS) continue;
    if (EGYPTIAN_MOBILE.test(run)) continue;
    /* A date read without its separators — «10-9-2026» → «1092026» — is nine
       digits and already excluded by the minimum; «20260910» styles are eight.
       A run that is ALL the same digit is an OCR artefact off a border. */
    if (/^(\d)\1+$/.test(run)) continue;
    candidates.push(run);
  }

  return candidates.at(-1) ?? null;
}

/**
 * The amount in piastres, or null.
 *
 * ## Why the FIRST money-shaped number and not the largest
 *
 * Both layouts print what was sent before what it cost and before the running
 * balance:
 *
 *   «تم تحويل **250** جنيه … مصاريف الخدمة 1 جنيه … رصيد حسابك الحالي 41196.99»
 *   «المبلغ **250.00** … رسوم الخدمة 1.00 … إجمالي المبلغ المخصوم 251.00»
 *
 * The largest number on a Vodafone receipt is the BALANCE (41196.99), and the
 * last is the total WITH fees (251.00). Neither is what the student paid for
 * the book. The first is.
 *
 * ⚠️ Which is also why the fee itself is skipped: `1` and `1.00` are money
 * shaped and come first on neither layout, but a stray `1` elsewhere would
 * outrank the real amount — so anything under `MIN_PLAUSIBLE_CENTS` is ignored
 * rather than trusted.
 */
export function readAmountCents(text: string): number | null {
  const digits = toAsciiDigits(text);

  /* ⚠️ EXACTLY two decimals, and nothing else counts.
     A bare integer is not safe to read as money from this text. Measured on the
     ten production receipts: taking the first plausible integer returned the
     right amount ONCE and returned a battery percentage, a year and a fragment
     of redacted text the other times — «48», «2026», «171», «83». The Arabic
     label that would have anchored it is not available, because the pass that
     reads Arabic well reads DIGITS badly: `ara+eng` turns «المبلغ 250.00 جنيه»
     into «المبلغ 0 جنيه». So the shape is the only anchor left, and a two-place
     decimal is a shape that junk does not take.
     The cost is that a Vodafone-Cash SMS — which writes «250 جنيه» with no
     decimals — reads as null. That is the correct outcome: null means «مقريتش»,
     and this field exists to flag a mismatch, so a guess is worse than a
     blank. */
  for (const match of digits.matchAll(/(\d{1,6})[.,](\d{2})(?!\d)/g)) {
    const whole = Number.parseInt(match[1] ?? '', 10);
    const fraction = Number.parseInt(match[2] ?? '', 10);
    if (!Number.isFinite(whole) || !Number.isFinite(fraction)) continue;

    const cents = whole * 100 + fraction;
    /* The fee (1.00) is under the floor and the running balance (41196.99) is
       over the ceiling — which is exactly what the window is sized for. */
    if (cents < MIN_PLAUSIBLE_CENTS || cents > MAX_PLAUSIBLE_CENTS) continue;

    /* A long digit run that merely CONTAINS something amount-shaped is a
       reference or a phone, not an amount. Anchored on the whole token. */
    const token = tokenAround(digits, match.index ?? 0);
    if (/^\d{7,}$/.test(token)) continue;

    return cents;
  }
  return null;
}

/**
 * The floor and ceiling of "an amount a student pays for a book".
 *
 * The book is 250 EGP and shipping takes it to about 300. The window is wide on
 * purpose — it exists to throw out the service fee (1.00), the flat number
 * («٤٣» in an address), a floor number and a four-figure balance, not to
 * second-guess the price list. `submitPayment` records what this returns and
 * never compares it to anything; the comparison is the admin's.
 */
const MIN_PLAUSIBLE_CENTS = 2000; // ٢٠ جنيه
const MAX_PLAUSIBLE_CENTS = 500000; // ٥٠٠٠ جنيه

/** The whitespace-delimited token the match at `index` belongs to. */
function tokenAround(text: string, index: number): string {
  let start = index;
  while (start > 0 && !/\s/.test(text[start - 1] ?? ' ')) start -= 1;
  let end = index;
  while (end < text.length && !/\s/.test(text[end] ?? ' ')) end += 1;
  return text.slice(start, end);
}

/** Both readings of one receipt. */
export function parseReceiptText(text: string): ReceiptReading {
  return { ref: readReference(text), amountCents: readAmountCents(text) };
}
