/**
 * Reading transfers off the phone that received them.
 *
 * Two texts reach this module, both captured on the handset that received the
 * money and both trusted for that reason — nothing a student uploads is ever
 * parsed here:
 *
 *   * The InstaPay push, forwarded by a notification listener on the Android
 *     handset that receives it. Usually one at a time, live; several at once
 *     when a capture is pasted in by hand.
 *         «لقد استلمت 250.00 جنيه من moazkoritam@instapay»
 *   * Banque Misr's SMS for the same money.
 *         «تم اضافة مبلغ 250EGP الى حساب رقم xxx1734 فى 07-SEP-2026»
 *
 * Only the first identifies anybody. The SMS names no sender and gives no
 * clock time, so a day with two 250-pound transfers is one row as far as it is
 * concerned — it is parsed and stored as corroboration that money arrived,
 * never as grounds for opening a course. The address in the notification is
 * what `StudentPaymentAddress` turns into a student.
 *
 * ## Why an unreadable line becomes a row instead of being dropped
 *
 * Live Text is OCR: a glare on the screen or a notification half-covered by
 * the one above it produces a line this parser cannot read. Dropping it means
 * a student's money arrived and the platform is silent about it, which is the
 * one outcome worth engineering against. So a line that is RECOGNISABLY a
 * transfer («استلمت» is there) but does not parse is returned with a null
 * amount, to be stored and shown in the admin queue as "something arrived we
 * could not read".
 */

/**
 * An InstaPay address as it is stored and compared — lower-cased and trimmed.
 *
 * The join between `IncomingTransfer.senderHandle` and
 * `StudentPaymentAddress.handle` is a plain string equality, and everything
 * automatic about this feature runs through it. A stray capital from one
 * notification would silently send a known payer back to the manual queue,
 * which is the kind of bug that looks like "it just stopped working".
 */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

/** Piastres. `«250.00 جنيه»` is 25000. */
export type ParsedTransfer = {
  source: 'notification' | 'sms';
  /** `null` when the line was recognisably a transfer but did not parse. */
  amountCents: number | null;
  /** The sender's InstaPay address. Always `null` for `sms`, which names no
   *  sender, and for an unreadable notification line. */
  senderHandle: string | null;
  /** Verbatim from the posted text — the evidence behind whatever this row
   *  goes on to authorise. */
  rawLine: string;
};

/**
 * Arabic-Indic and Extended Arabic-Indic digits to ASCII, and the Arabic
 * decimal separator to a full stop.
 *
 * Deliberately CHARACTER-FOR-CHARACTER: every replacement is one code unit
 * for one code unit, so an index into the normalised string is still an index
 * into the original and `rawLine` can be sliced from the text the admin's
 * phone actually sent. Thousands separators are NOT removed here for the same
 * reason — they are stripped when the number is parsed instead.
 */
function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹٫]/g, (character) => {
    if (character === '٫') return '.';
    const code = character.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** `"1,250.13"` → `125013`. `null` for anything that is not a plain money
 *  amount — a guard, not a formality: this number authorises access. */
function toCents(amount: string): number | null {
  const cleaned = amount.replace(/[,٬\s]/g, '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [pounds, fraction = ''] = cleaned.split('.');
  const cents = Number(pounds) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** A money amount as it appears in either text, thousands separators and all. */
const AMOUNT = String.raw`\d[\d,٬]*(?:\.\d{1,2})?`;

/**
 * «لقد استلمت 250.13 جنيه من moazkoritam@instapay».
 *
 * `\s+` between «من» and the address spans the line break Live Text puts
 * there — the notification wraps, and the address is usually on its own line.
 * The address itself is deliberately loose: it is `name@instapay` for a
 * student who created one, `eg6300010002200000@instapay` for a bank account
 * that never did, and `name@somebank` for an address issued by a bank other
 * than InstaPay itself. It is recorded, never matched, so a wrong guess about
 * its shape costs a display string and nothing else.
 */
const NOTIFICATION = new RegExp(
  String.raw`استلمت\s+(${AMOUNT})\s*(?:جنيه|EGP)\s+من\s+([^\s]+@[^\s]+)`,
  'g',
);

/**
 * «تم اضافة مبلغ 250.13EGP الى حساب رقم xxx1734».
 *
 * Both spellings of the hamza («اضافة» is what Banque Misr actually sends;
 * «إضافة» is what anyone typing it by hand would write) and no space required
 * before `EGP`, because the bank does not put one.
 */
const SMS = new RegExp(String.raw`تم\s+[إأا]ضافة\s+مبلغ\s+(${AMOUNT})\s*(?:EGP|جنيه)`, 'g');

/** The words that make a line recognisably a transfer even when it does not
 *  parse — see the module doc on why those become rows too. */
const MARKERS: { pattern: RegExp; source: 'notification' | 'sms' }[] = [
  { pattern: /استلمت/g, source: 'notification' },
  { pattern: /[إأا]ضافة\s+مبلغ/g, source: 'sms' },
];

/** How much of the surrounding text an unreadable line keeps, so an admin can
 *  see what the parser choked on without being handed the whole screenshot. */
const UNREADABLE_CONTEXT = 90;

type Span = { start: number; end: number };

function overlaps(spans: Span[], index: number): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}

/**
 * Every transfer the text describes, in the order it describes them.
 *
 * Duplicates within ONE blob are collapsed: a screenshot routinely catches the
 * same notification twice, once whole and once as the sliver peeking out from
 * under the card above it. Two rows for one transfer is not merely untidy —
 * the second would sit in the queue forever as money that arrived and matched
 * nothing. Collapsing is safe because a reserved code makes the amount unique
 * while it is live, so two identical amounts from one sender inside a single
 * screenshot are the same transfer seen twice.
 */
export function parseTransferText(text: string): ParsedTransfer[] {
  const normalized = normalizeDigits(text);
  const found: ParsedTransfer[] = [];
  const matched: Span[] = [];

  for (const [pattern, source] of [
    [NOTIFICATION, 'notification'],
    [SMS, 'sms'],
  ] as const) {
    pattern.lastIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
      const start = match.index ?? 0;
      matched.push({ start, end: start + match[0].length });
      found.push({
        source,
        amountCents: toCents(match[1] ?? ''),
        // An SMS names no sender. A notification always does — the regex
        // could not have matched otherwise.
        senderHandle:
          source === 'notification' && match[2] ? normalizeHandle(match[2]) : null,
        rawLine: text.slice(start, start + match[0].length).trim(),
      });
    }
  }

  for (const { pattern, source } of MARKERS) {
    pattern.lastIndex = 0;
    for (const marker of normalized.matchAll(pattern)) {
      const index = marker.index ?? 0;
      if (overlaps(matched, index)) continue;
      const start = Math.max(0, index - 20);
      found.push({
        source,
        amountCents: null,
        senderHandle: null,
        rawLine: text.slice(start, index + UNREADABLE_CONTEXT).trim(),
      });
    }
  }

  const seen = new Set<string>();
  return found.filter((transfer) => {
    // An unreadable line is never deduped against another: two of them are
    // two separate things an admin has to look at, and their text is the
    // parser's failure rather than the transfer's identity.
    if (transfer.amountCents === null) return true;
    const key = `${transfer.source}|${transfer.amountCents}|${transfer.senderHandle ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
