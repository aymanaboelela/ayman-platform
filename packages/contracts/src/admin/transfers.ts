import { z } from '@ayman/contracts/zod';

/**
 * The ledger of money that actually arrived — «التحويلات الواردة».
 *
 * Read the `StudentPaymentAddress` and `IncomingTransfer` model docs for why
 * this exists. In short: the platform cannot identify an InstaPay transfer
 * from anything a student supplies, so it learns the sender's address from
 * the admin's own first approval and matches on it from then on.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/** See the `IncomingTransferSource` enum's own doc. */
export const IncomingTransferSourceSchema = z.enum(['notification', 'sms', 'manual']);
export type IncomingTransferSource = z.infer<typeof IncomingTransferSourceSchema>;

/**
 * Text captured on the handset that received the money, posted by its
 * notification listener.
 *
 * Usually one InstaPay push, forwarded the instant it appears. A capture
 * pasted in by hand can carry six or seven at once, and can mix the bank's
 * SMS in with them; the parser decides what each line is.
 *
 * The 20,000-character ceiling is a whole screenshot's worth of Live Text
 * with room to spare, and exists so a misconfigured Shortcut posting a photo
 * library's worth of text is refused rather than parsed.
 */
export const IngestTransfersSchema = z
  .object({
    text: z.string().min(1).max(20_000),
    /** ISO 8601. When the capture happened — for an SMS forwarded on arrival
     *  that is also when the money landed, but for a notification list
     *  screenshotted hours later it is not. See `IncomingTransfer.receivedAt`.
     *  Omitted means "now", which is what a Shortcut posting immediately
     *  should send. */
    capturedAt: z.iso.datetime().optional(),
  })
  .strict();
export type IngestTransfersInput = z.infer<typeof IngestTransfersSchema>;

/** What one ingest did — the numbers the Shortcut shows back on the phone. */
export const IngestTransfersResultSchema = z.object({
  /** Transfers the parser found in the text. */
  read: z.number().int(),
  /** New ledger rows written. */
  created: z.number().int(),
  /** Already held, and skipped — the same screenshot posted twice. */
  duplicates: z.number().int(),
  /** Rows that found a live reservation and opened a course by themselves. */
  matched: z.number().int(),
  /** Lines that were recognisably a transfer but did not parse. Kept, and
   *  waiting in the admin queue. */
  unreadable: z.number().int(),
});
export type IngestTransfersResult = z.infer<typeof IngestTransfersResultSchema>;

/** One row of «التحويلات الواردة». */
export const AdminTransferRowSchema = z.object({
  id: z.uuid(),
  source: IncomingTransferSourceSchema,
  /** `null` on a line the parser could not read. */
  amountCents: z.number().int().nullable(),
  /** The sender's InstaPay address, lower-cased. `null` for an SMS, which
   *  names none — and can therefore never approve anything by itself. */
  senderHandle: z.string().nullable(),
  /** Whose address that is, when the platform has learned it. The difference
   *  between «تحويل من مجهول» and «تحويل من أحمد، بس مش طالب حاجة» — one is a
   *  row to investigate, the other is a row to glance at. */
  senderStudentName: z.string().nullable(),
  rawLine: z.string(),
  receivedAt: z.iso.datetime(),
  /** Set when this transfer paid for a course subscription. At most one of
   *  this and `matchedBookOrderId` is ever set — one transfer pays for one
   *  thing. The student and course come with it, so the row reads as a
   *  sentence rather than an id. */
  matchedSubmissionId: z.uuid().nullable(),
  /** Set when it paid for a printed book instead. `matchedStudentName` is who
   *  placed the order — `null` for a guest checkout, which has no account. */
  matchedBookOrderId: z.uuid().nullable(),
  matchedStudentName: z.string().nullable(),
  /** `null` for a book order, which is not about a course. */
  matchedCourseTitle: z.string().nullable(),
  /** An admin marked it as needing no action. */
  dismissedAt: z.iso.datetime().nullable(),
});
export type AdminTransferRow = z.infer<typeof AdminTransferRowSchema>;

export const AdminTransferListSchema = z.object({
  rows: z.array(AdminTransferRowSchema),
  rowCount: z.number().int(),
});
export type AdminTransferList = z.infer<typeof AdminTransferListSchema>;

/** Which slice of the ledger a screen is asking for. `unmatched` is the one
 *  that matters — money that arrived and nothing explains. */
export const AdminTransferFilterSchema = z.enum(['unmatched', 'matched', 'dismissed', 'all']);
export type AdminTransferFilter = z.infer<typeof AdminTransferFilterSchema>;
