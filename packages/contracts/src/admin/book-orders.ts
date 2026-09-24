import { z } from '@ayman/contracts/zod';
import { BookOrderSchema, BookOrderStatusSchema } from '@ayman/contracts/book-orders';
import { BookOrderLineSchema } from '@ayman/contracts/books';
import { AdminBookOrderLinesSchema } from '@ayman/contracts/admin/books';
import { egyptianPhone } from '@ayman/contracts/phone';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

/**
 * The admin's `/admin/books` list — one row per `BookOrder`.
 *
 * `status` splits the screen into exactly the two lists Ayman asked for by
 * name: `address_only` ("started but never paid" — kept, never deleted, on
 * its OWN tab) and `paid`/`shipped` (the "real" orders). See the `BookOrder`
 * model doc for why `status` moving to `paid` needs no separate admin
 * approval click.
 *
 * `q` — «عشان أعرف أوصل». The shipping desk answers the phone, and the
 * caller identifies themselves by whatever they have: their name, the number
 * they ordered on, or where they live. Kept from `ListQuerySchema` rather
 * than omitted (as it was) so all three reach one filter — see
 * `BookOrdersService.adminList` for the fields it actually spans and for why
 * a partial phone number needs normalising before it can match anything.
 */
/**
 * The tab bar's own vocabulary: every real status, plus `deleted`.
 *
 * `deleted` is NOT a `BookOrderStatus` and must never become one — see that
 * enum's note. It is a VIEW: `deletedAt IS NOT NULL`, whatever status the row
 * was carrying when it was hidden. Every other value means «status = X AND not
 * deleted», and no value at all means «not deleted», so a soft-deleted order
 * cannot reappear on a screen that did not ask for it.
 */
export const AdminBookOrderFilterSchema = z.enum([
  ...BookOrderStatusSchema.options,
  'deleted',
]);
export type AdminBookOrderFilter = z.infer<typeof AdminBookOrderFilterSchema>;

/**
 * How the list is ordered.
 *
 * ⚠️ There was NO sort at all: `adminList` hard-coded `orderBy: [{ createdAt:
 * 'asc' }]`, and the screen sent no `page` either — so on a tab with more rows
 * than one page, only the OLDEST `perPage` of them could ever be reached. The
 * newest order was the one guaranteed to be invisible, on a screen whose job is
 * shipping today's parcels.
 *
 * `oldest` stays the DEFAULT, and deliberately: the shipping desk works
 * first-come-first-served, and flipping that silently would change which parcel
 * gets packed first. What changes is that it is now a choice.
 *
 * Every value maps to a real column, so ordering happens in SQL and survives
 * pagination. A sort computed in JavaScript over one page is a sort of that
 * page, which is worse than none — it looks right and is wrong.
 */
export const AdminBookOrderSortSchema = z.enum([
  'oldest',
  'newest',
  'amount_desc',
  'amount_asc',
  'name_asc',
  /** The courier route: everything going to one governorate together, which is
   *  how a day's run is actually built. */
  'governorate',
]);
export type AdminBookOrderSort = z.infer<typeof AdminBookOrderSortSchema>;

/** «ورّيني اللغات بس» / «العام بس» — the owner's headline ask on this screen.
 *
 *  A stream is a property of the BOOK on each line, with the order's course as
 *  a fallback for the rows that came from a course button (a cart order has no
 *  course at all). Both are consulted — see the service's own `streamWhere`. */
/**
 * «أولى» / «تانية» / «تالتة» — the three secondary years as one word each,
 * indexed by `year - 1`.
 *
 * ## Why a constant here and not `academic_years.badge_ar`
 *
 * That column is keyed by (system, year) and is the right source for a COURSE
 * badge, where the system is known. A book order is not: a cart can hold a book
 * for either system, `books.year` is a plain `Int` for exactly that reason (see
 * the model doc), and asking the taxonomy would mean picking a system to ask
 * about — a choice with no right answer on this screen.
 *
 * ## Why it is shared rather than three literals per surface
 *
 * The same three words are printed by the screen, the A4 packing sheet and the
 * `.xlsx` summary, and those three are read side by side on the day a print run
 * is ordered. `/admin/books` carried its own copy of this array; the sheet
 * printed «الصف 1» instead, so the header the admin compares against said a
 * different thing from the file he compares it with.
 */
export const BOOK_ORDER_YEAR_WORDS = ['أولى', 'تانية', 'تالتة'] as const;

/** `null` → `null`, so a caller renders «من غير صف» rather than «سنة null». An
 *  out-of-range year falls back to its own digits instead of `undefined`. */
export function bookOrderYearWord(year: number | null): string | null {
  if (year === null) return null;
  return BOOK_ORDER_YEAR_WORDS[year - 1] ?? String(year);
}

export const AdminBookOrderStreamSchema = z.enum(['general', 'languages']);
export type AdminBookOrderStream = z.infer<typeof AdminBookOrderStreamSchema>;

export const AdminBookOrderQuerySchema = ListQuerySchema.extend({
  status: AdminBookOrderFilterSchema.optional(),
  sort: AdminBookOrderSortSchema.default('oldest'),
  stream: AdminBookOrderStreamSchema.optional(),
  /** الصف الدراسي — matched against the BOOK's own year, falling back to the
   *  order's course, exactly like `stream`. */
  year: z.coerce.number().int().min(1).max(3).optional(),
}).omit({ dir: true });
export type AdminBookOrderQuery = z.infer<typeof AdminBookOrderQuerySchema>;

/**
 * «راجعته وتمام» — what the API answers when a hold is lifted.
 *
 * The id and the fact it is no longer held, nothing else. The screen reloads
 * the row it already has; a whole `AdminBookOrderRow` here would be a second
 * shape of the same order to keep in agreement with the first.
 */
export const ClearBookOrderHoldResultSchema = z.object({
  id: z.uuid(),
  /** Always null on success — the field is here so the caller can assert it
   *  rather than assume it. */
  heldForReviewAt: z.null(),
});
export type ClearBookOrderHoldResult = z.infer<typeof ClearBookOrderHoldResultSchema>;

export const AdminBookOrderRowSchema = z.object({
  id: z.uuid(),
  /** `null` for a GUEST order — no account is linked. `fullName`/`phone`
   *  below (the order's own submitted fields) are the source of truth for
   *  shipping either way; these three are incidental account context. */
  userId: z.string().nullable(),
  studentName: z.string().nullable(),
  studentEmail: z.string().nullable(),
  studentPhone: z.string().nullable(),
  /**
   * ⚠️ All four course fields are NULLABLE since the shop shipped. An order
   * placed from `/books` is a basket that may span two years and two subjects,
   * so there is no course to name — `items` below is what such a row is made
   * of, and it is the field the screen renders. The course fields survive for
   * orders that came from a course page's own button, where they are the most
   * useful thing on the row.
   */
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  courseYear: z.number().int().min(1).max(3).nullable(),
  /**
   * Which stream(s) this COURSE serves — `forGeneral`/`forLanguages` on the
   * course itself, not a separate book-language field. The Excel export
   * maps this to «عام» / «لغات» / «الاتنين» for the print shop; see
   * `streamChoiceOf` in `@ayman/contracts/content`.
   */
  courseForGeneral: z.boolean().nullable(),
  courseForLanguages: z.boolean().nullable(),
  bookTitle: z.string(),
  /**
   * Every book in this order, with the price and quantity it was placed at.
   *
   * THE column of this screen — «كل واحد عايز كام كتاب» is read straight off it
   * — and the reason `bookTitle` above is no longer enough on its own. For an
   * order that predates the shop this holds the single line the migration
   * back-filled, so the list has no two shapes to render.
   */
  items: z.array(BookOrderLineSchema),
  amountCents: z.number().int(),
  /** The breakdown behind `amountCents`. Shipping is charged once per order. */
  itemsCents: z.number().int(),
  shippingCents: z.number().int(),
  discountCents: z.number().int(),
  /** What an admin wrote about this order. Never shown to the customer. */
  adminNote: z.string().nullable(),
  fullName: z.string(),
  phone: z.string(),
  altPhone: z.string(),
  governorateCode: z.string(),
  governorateNameAr: z.string(),
  city: z.string(),
  addressStreet: z.string(),
  addressBuilding: z.string().nullable(),
  addressNote: z.string().nullable(),
  /** The Vodafone Cash number the transfer was sent FROM — `null` while
   *  `status: 'address_only'`. */
  senderPhone: z.string().nullable(),
  /** Whether there is a screenshot to open — `null` while `address_only`,
   *  always present once `paid`. Lets the UI skip requesting the screenshot
   *  route for a row that has none. */
  hasScreenshot: z.boolean(),
  /** «مجاني» — handed over without charging. The row renders a badge and the
   *  money line reads as a giveaway rather than as a zero-pound sale. */
  isFree: z.boolean(),
  status: BookOrderStatusSchema,
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  /**
   * «محجوز للمراجعة» — set when reading the receipt found something the admin
   * has to look at before the parcel moves. Null is the normal case.
   *
   * On the ROW rather than behind a filter, because the chip has to be visible
   * wherever the order is: an order that vanishes from the printing run with
   * nothing on the list saying why is a parcel that looks lost.
   */
  heldForReviewAt: z.iso.datetime().nullable(),
  /** `amount_short` or `duplicate_receipt` — what to go and look at. */
  heldReason: z.string().nullable(),
  /** The amount read off the screenshot, in piastres, or null when the picture
   *  could not be read. Compared against `amountCents` by eye on the screen —
   *  the platform only acts on it when it is SHORT. */
  screenshotAmountCents: z.number().int().nullable(),
  /** «راح للمطبعة» — when this order's copy went into a print run. `null` for
   *  an order that never passed through the printer, which is a real path and
   *  not a missing value: see `BookOrderStatusSchema`. */
  printedAt: z.iso.datetime().nullable(),
  shippedAt: z.iso.datetime().nullable(),
  /** Set when the admin confirmed ARRIVAL, which is the transition that
   *  notifies the student. `shippedAt` only records that it left. */
  deliveredAt: z.iso.datetime().nullable(),
  rejectedAt: z.iso.datetime().nullable(),
  /** The admin's own words, shown to the student. Non-null exactly when
   *  `rejectedAt` is — a database CHECK keeps the pair together. */
  rejectionReason: z.string().nullable(),
  /** Non-null on a soft-deleted row, which only the «المحذوفة» filter returns.
   *  The row keeps its `status`, so the admin can see what it was deleted FROM. */
  deletedAt: z.iso.datetime().nullable(),
  deletionReason: z.string().nullable(),
  /**
   * How many OTHER orders this phone number has placed — «أعرف إن الراجل ده
   * طلب كتاب قبل كده ولا لأ».
   *
   * Counted on `phone`, not on `userId`, and that is the whole point: guest
   * checkout means the same person can appear as four unlinked rows, and the
   * number they typed is the only thing all four share. Soft-deleted orders are
   * NOT counted — «طلب قبل كده» is about a real history, and a row the admin
   * hid is one they decided did not happen.
   *
   * `0` is the common case and is what the badge is absent for.
   */
  previousOrdersFromPhone: z.number().int().min(0),
});
export type AdminBookOrderRow = z.infer<typeof AdminBookOrderRowSchema>;

export const AdminBookOrderListSchema = listResponse(AdminBookOrderRowSchema);

/** «اتشحن» — `BookOrdersService.markShipped`'s own confirmation, the same
 *  "return what actually happened" convention as `TermSetOpenResultSchema`. */
export const MarkBookOrderShippedResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('shipped'),
  shippedAt: z.iso.datetime(),
});
export type MarkBookOrderShippedResult = z.infer<typeof MarkBookOrderShippedResultSchema>;

/** «وصل» — the arrival confirmation, same convention as the one above. */
export const MarkBookOrderDeliveredResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('delivered'),
  deliveredAt: z.iso.datetime(),
});
export type MarkBookOrderDeliveredResult = z.infer<typeof MarkBookOrderDeliveredResultSchema>;

/** «راح للمطبعة» — the hand-off BEFORE the courier's. Same convention again. */
export const MarkBookOrderPrintingResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('printing'),
  printedAt: z.iso.datetime(),
});
export type MarkBookOrderPrintingResult = z.infer<typeof MarkBookOrderPrintingResultSchema>;

/**
 * «الفلوس وصلت» — an admin settling an order that is still `address_only`.
 *
 * ## Why this exists at all
 *
 * The two-step public flow is the only thing that could ever move an order out
 * of «بدأ ومكملش الدفع»: the STUDENT had to come back and upload a screenshot.
 * Every other way money actually arrives — a transfer to Ayman's own wallet, a
 * hand-off in cash, a parent paying over the phone — left the row stranded on a
 * tab no ship route will touch, with no button anywhere on the screen to say so.
 * This is that button.
 *
 * ## `isFree` is the SAME question asked once
 *
 * «ممكن يبقى دفع وممكن يبقى مجاني» — the two are one decision about one order,
 * not two endpoints, because the admin is answering «اتحصّل منه إيه؟» exactly
 * once. `false` keeps the money the order was quoted at and records the
 * transfer; `true` discounts the whole basket so the row still says what the
 * book was WORTH while saying nothing was taken for it — the shape
 * `book_orders_free_collects_nothing` demands and the one `adminCreate`'s own
 * «مجاني» switch already writes.
 *
 * This is deliberately NOT `POST :id/free`, which stays what it is: a re-label
 * for an order that ALREADY collected zero, refusing anything that collected
 * money. Here the waiver is the point — the admin is deciding, now, that the
 * 250 ج will not be collected — and that is a money change, which is why it
 * carries its own audit action and its own before-value.
 *
 * `senderPhone`/`screenshotKey` are both optional and both meaningless when
 * `isFree`, same rule and same reasoning as `AdminCreateBookOrderSchema`: an
 * admin recording a transfer after the fact often has nothing to attach.
 */
export const MarkBookOrderPaidSchema = z
  .object({
    isFree: z.boolean().default(false),
    senderPhone: egyptianPhone('رقم المحوّل منه غير صالح').nullable().default(null),
    screenshotKey: z.string().min(1).max(255).nullable().default(null),
  })
  .strict();
export type MarkBookOrderPaidInput = z.infer<typeof MarkBookOrderPaidSchema>;

/**
 * What actually happened — same «return the new state» convention as
 * `MarkBookOrderShippedResultSchema` and its neighbours above.
 *
 * `amountCents` is in it because a «مجاني» settlement CHANGES it, and the card
 * that just showed 250 ج has to be able to show 0 ج without a second fetch.
 */
export const MarkBookOrderPaidResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('paid'),
  paidAt: z.iso.datetime(),
  isFree: z.boolean(),
  amountCents: z.number().int().min(0),
});
export type MarkBookOrderPaidResult = z.infer<typeof MarkBookOrderPaidResultSchema>;

/**
 * A written reason, required, and long enough to be an actual sentence.
 *
 * `.min(3)` rather than `.min(1)`: a one-character reason is a reason field
 * somebody typed past, and this string is read by the student on the rejection
 * and by whoever asks «ليه اتشال ده» a month later. `.max(300)` is the same
 * ceiling `addressNote` uses — it is a note, not a report.
 */
const reason = z
  .string()
  .trim()
  .min(3, 'اكتب سبب واضح')
  .max(300, 'السبب طويل أوي');

/**
 * «أرفضه» — turn the order down, and tell the student why.
 *
 * The reason is MANDATORY at the contract, at the DTO and at the database
 * (`book_orders_rejection_has_a_reason`), in that order, so the form says which
 * field is wrong instead of the service throwing a constraint name.
 */
export const RejectBookOrderSchema = z.object({ reason }).strict();
export type RejectBookOrderInput = z.infer<typeof RejectBookOrderSchema>;

export const RejectBookOrderResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('rejected'),
  rejectedAt: z.iso.datetime(),
  rejectionReason: z.string(),
});
export type RejectBookOrderResult = z.infer<typeof RejectBookOrderResultSchema>;

/**
 * «أحذفه وأكتب سبب الحذف» — hide the order from every working list.
 *
 * Soft, and the reason is internal: unlike a rejection, the student is not told
 * (there is often no student — most of these are guest rows), and the text is
 * there for the admin who finds the row under «المحذوفة» later. It does NOT
 * change `status`, so a deleted-while-paid order still reads as paid when it
 * comes back.
 */
export const DeleteBookOrderSchema = z.object({ reason }).strict();
export type DeleteBookOrderInput = z.infer<typeof DeleteBookOrderSchema>;

export const DeleteBookOrderResultSchema = z.object({
  id: z.uuid(),
  deletedAt: z.iso.datetime(),
  deletionReason: z.string(),
});
export type DeleteBookOrderResult = z.infer<typeof DeleteBookOrderResultSchema>;

/** «رجّعه» — undo a deletion. No reason: putting something back is not a
 *  decision anybody has to justify, and the audit log records who did it. */
export const RestoreBookOrderResultSchema = z.object({
  id: z.uuid(),
  status: BookOrderStatusSchema,
});
export type RestoreBookOrderResult = z.infer<typeof RestoreBookOrderResultSchema>;

/**
 * The book-order revenue tile `/admin/finance` composes ALONGSIDE, never
 * merged into, the subscription summary — see `BookOrdersService
 * .adminRevenueSummary`'s own note on why this stays a separate fetch.
 */
export const AdminBookOrderRevenueSummarySchema = z.object({
  revenueTotalCents: z.number().int().min(0),
  paidCount: z.number().int().min(0),
});
export type AdminBookOrderRevenueSummary = z.infer<typeof AdminBookOrderRevenueSummarySchema>;

/**
 * «أضف طلب كتاب» — an admin entering a customer's order directly from
 * `/admin/books`, rather than a customer going through the public/guest
 * order flow. Reaches `BookOrdersService`'s own `adminCreate`, which produces
 * the EXACT same kind of `BookOrder` row a real customer's order would — see
 * that method's own doc.
 *
 * Same field set as `CreateBookOrderSchema` (the public address form) plus
 * `paid`, the one control that lets the admin skip the two-step flow
 * entirely: `false` saves it exactly like a real customer's abandoned
 * address step (`status: 'address_only'`), `true` records money that
 * already changed hands outside the platform (a WhatsApp transfer, cash in
 * hand) and moves straight to `status: 'paid'` with `paidAt` stamped now —
 * see `adminCreate`'s own note on why this mirrors `submitPayment` rather
 * than reinventing it.
 *
 * `senderPhone`/`screenshotKey` are BOTH optional, unlike the public
 * `SubmitBookOrderPaymentSchema` where both are required — same reasoning as
 * `AdminManualSubscribeSchema.screenshotKey`: an admin recording a payment
 * after the fact often has nothing to attach and may not even have asked for
 * the sender's own number. Meaningful only when `paid: true`; ignored
 * otherwise (see `adminCreate`).
 *
 * No `courseId` restriction encoded here beyond shape — `bookTitle`/
 * `bookPriceCents` being set is checked server-side in `adminCreate`, same
 * as the public flow's own `create()`.
 */
export const AdminCreateBookOrderSchema = z
  .object({
    /** The course-book flow — exactly one of this and `items`. Same rule, and
     *  the same reasoning, as `CreateBookOrderSchema`'s own refinement. */
    courseId: z.uuid().optional(),
    /**
     * «أضيف لحد كتاب وأكتب هيدفع كام» — a basket the admin types.
     *
     * Unlike the public `BookCartSchema`, each line carries its own
     * `unitPriceCents`: this route is behind `book-order:write`, the whole
     * point of the screen is to record what a human agreed to on the phone, and
     * forcing the price back through `books.price_cents` would mean changing
     * the shop for everyone to give one person a discount.
     */
    items: AdminBookOrderLinesSchema.optional(),
    /** Waiving delivery is `0`. Omitted means "charge the current fee". */
    shippingCents: z.number().int().min(0).max(10_000_000).optional(),
    discountCents: z.number().int().min(0).max(10_000_000).optional(),
    adminNote: z.string().trim().max(1_000).nullable().default(null),
    fullName: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120),
    phone: egyptianPhone('رقم الموبايل مطلوب'),
    altPhone: egyptianPhone('رقم موبايل تاني مطلوب للتواصل'),
    governorateCode: z.string().length(2, 'لازم نحدد المحافظة'),
    city: z.string().trim().min(1, 'المدينة مطلوبة').max(100),
    addressStreet: z.string().trim().min(1, 'اسم الشارع مطلوب').max(200),
    addressBuilding: z.string().trim().max(60).nullable().default(null),
    addressNote: z.string().trim().max(300).nullable().default(null),
    /**
     * «أضفته مجاني» — handed over without charging.
     *
     * A separate decision from `paid` below, and the two together are what
     * make the row honest: a free order is `paid: true` (there is nothing left
     * to collect) AND `isFree: true` (nothing was collected). Without the
     * second half it is a zero-pound sale, which is indistinguishable from a
     * typo and is counted among the paid orders.
     *
     * The server sets `discountCents` to cover the whole basket when this is
     * on, so the row still records what the book was WORTH while recording
     * that nothing was taken for it — and `book_orders_free_collects_nothing`
     * refuses the row otherwise.
     *
     * ⚠️ Leaves REVENUE only. The copies still cost what they cost to print,
     * and cost of sales still counts them. See `BookOrder.isFree`.
     */
    isFree: z.boolean().default(false),
    /** `true` — paid now, mirrors `submitPayment`. `false` — address-only,
     *  mirrors `create()` alone, exactly the abandoned-cart shape. */
    paid: z.boolean(),
    senderPhone: egyptianPhone('رقم المحوّل منه غير صالح').nullable().default(null),
    screenshotKey: z.string().min(1).max(255).nullable().default(null),
  })
  .strict()
  .refine((value) => (value.courseId === undefined) !== (value.items === undefined), {
    message: 'الطلب لازم يبقى إما كتاب كورس واحد أو سلة كتب — مش الاتنين',
    path: ['items'],
  });
export type AdminCreateBookOrderInput = z.infer<typeof AdminCreateBookOrderSchema>;

/** The admin-create route's own response — the exact same `BookOrder` shape
 *  a real customer's order would produce. */
export const AdminCreateBookOrderResultSchema = BookOrderSchema;

/**
 * ## الشحن بالجملة — «طلب ١٠ كتب النهاردة، ودي المبعة يطبع»
 *
 * Shipping is a BATCH operation in real life: Ayman takes the day's paid
 * orders to the courier together, comes back, and marks them. Doing that one
 * row at a time is ten confirmations and ten chances to lose track of which
 * ones he already pressed — «بتلخبط أنا شحنت ولا لأ» is the actual failure
 * being fixed, and it is a UI problem that only a batch endpoint can solve
 * properly: ten separate requests can half-succeed and leave the list in a
 * state neither he nor the screen can describe.
 *
 * ⚠️ 100 is the ceiling and it is generous on purpose — the real batch is
 * ten to forty. The cap exists so a runaway selection cannot turn one click
 * into a thousand WhatsApp messages from a personal, ban-able device.
 */
export const BulkBookOrderActionSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    /**
     * Send the notice on WhatsApp TOO — off by default.
     *
     * ⚠️ The notice itself is NOT this. «عايز تتبعت في الشات على المنصة
     * أصلاً، مش واتساب» — the student is told inside the platform, in his own
     * thread, every time. WhatsApp is a second copy for people who do not open
     * the site often, and it is opt-in because it leaves the platform: it
     * goes out from Ayman's own linked device (the campaign sidecar), which
     * can be offline and can be rate-limited by WhatsApp itself. Making the
     * essential notice depend on it would put a parcel update behind a
     * ban-able third-party socket.
     *
     * The ONE exception is a guest order with no account: there is no thread
     * to post into, so WhatsApp is the only channel that exists and the
     * service uses it regardless of this flag.
     */
    whatsapp: z.boolean().default(false),
  })
  .strict();
export type BulkBookOrderAction = z.infer<typeof BulkBookOrderActionSchema>;

/**
 * What one row in a batch did — reported per id, never as one overall
 * success/failure.
 *
 * A batch where eight shipped, one was already shipped and one had no
 * WhatsApp account is the NORMAL outcome, not an error, and an endpoint that
 * answered "ok" or "failed" would make the admin re-check ten rows by hand to
 * find out which. Each outcome names something he can act on:
 *
 *   · `shipped` — marked, and the message went out.
 *   · `notice_failed` — marked shipped, but the message did not send. The
 *     parcel is genuinely gone; only the notice needs a retry, which is why
 *     this is not `skipped` and not a rollback.
 *   · `skipped` — the row was not in `paid`. Already shipped, rejected, or
 *     never paid; re-selecting it is a mistake, not a fault.
 *   · `printing` — «راح للمطبعة». No message of its own: sending paper to a
 *     print shop is not news to the student, and telling them would promise a
 *     date the run cannot keep.
 *   · `review_cleared` — «راجعتهم، كمّلوا». The hold came off, so the parcel
 *     rejoins the print run and the shipping buttons. A row that had NO hold
 *     is reported as `skipped` with «مش محجوز» rather than as a clear: the
 *     batch changed nothing about it, and saying it did would inflate the
 *     count the admin reads to mean «دول كانوا محجوزين».
 */
/**
 * The `reason` a `review-ok` batch gives for a row that carried no hold.
 *
 * Shared rather than written twice because the CLIENT matches on it: the
 * selection «راجعتهم، كمّل» runs on is normally the whole packing list, so
 * almost every row comes back with this reason, and the toast hides them
 * instead of naming forty-eight parcels that were always fine. Two copies of
 * this string — one of them a letter different — would turn that filter off
 * silently. See `report()` in `bulk-ship.tsx`.
 */
export const BULK_NOT_HELD_REASON = 'مش محجوز';

export const BulkBookOrderOutcomeSchema = z.enum([
  'shipped',
  'printing',
  'delivered',
  'review_cleared',
  'notice_failed',
  'skipped',
]);
export type BulkBookOrderOutcome = z.infer<typeof BulkBookOrderOutcomeSchema>;

export const BulkBookOrderResultRowSchema = z.object({
  id: z.uuid(),
  outcome: BulkBookOrderOutcomeSchema,
  /** The student's name, so the summary can NAME the rows that need a look
   *  rather than printing ids the admin cannot match to anybody. */
  fullName: z.string(),
  /** Why it skipped or why the notice failed — «الرقم مش على واتساب». */
  reason: z.string().nullable(),
});
export type BulkBookOrderResultRow = z.infer<typeof BulkBookOrderResultRowSchema>;

export const BulkBookOrderResultSchema = z.object({
  rows: z.array(BulkBookOrderResultRowSchema),
  /** Counts for the toast, so the client never has to re-derive them. */
  succeeded: z.number().int(),
  noticeFailed: z.number().int(),
  skipped: z.number().int(),
});
export type BulkBookOrderResult = z.infer<typeof BulkBookOrderResultSchema>;

/**
 * The packing-list export — «هتقول انت عايز من يوم كام لـ يوم كام».
 *
 * `from`/`to` are DATES (`YYYY-MM-DD`), not timestamps: the question being
 * asked is «طلبات النهاردة» or «من الأحد للخميس», and making the admin think
 * about hours and time zones to answer it is the wrong tool. The service
 * widens them to a full local day at each end.
 *
 * Both optional and independent — `from` alone is «من التاريخ ده لغاية
 * دلوقتي», which is the common case when he is catching up.
 *
 * ## Why `stream`/`year`/`q` are here too
 *
 * «جالب إن واحد ناقص». The export used to take ONLY the tab and the dates,
 * while the screen above it was also filtering on «عربي / لغات», «الصف» and
 * the search box — so the file could never be the list the admin was looking
 * at when they pressed the button. Every one of those three is a filter he can
 * SEE is on, and a spreadsheet that silently ignores a visible filter is a
 * spreadsheet he has to re-count by hand. The rule this locks in: the sheet is
 * the screen, always, and there is no way to press export and get a different
 * set of orders than the one on display.
 */
export const ExportBookOrdersQuerySchema = z
  .object({
    status: AdminBookOrderFilterSchema,
    from: z.iso.date().nullable().default(null),
    to: z.iso.date().nullable().default(null),
    stream: AdminBookOrderStreamSchema.optional(),
    year: z.coerce.number().int().min(1).max(3).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict();
export type ExportBookOrdersQuery = z.infer<typeof ExportBookOrdersQuerySchema>;

/**
 * The same packing list as JSON — what `/admin/books/print` renders into an
 * A4 PDF.
 *
 * ## Why the PDF is rendered by the BROWSER and not by the API
 *
 * «وانا بعمل تحميل يتعمل PDF أحسن». A PDF of an Arabic packing list needs
 * bidi + shaping, and no Node PDF library on npm does Arabic properly —
 * pdfkit/pdfmake both emit reversed, unjoined letters, which on a sheet handed
 * to a print shop is worse than no sheet. A browser already shapes Arabic
 * perfectly, so the print page IS the renderer: same rows, same grouping, same
 * summary as the `.xlsx`, laid out for A4 and printed with Ctrl+P → «حفظ
 * كـ PDF». No Chromium in the API container, and what he sees on screen is
 * byte-for-byte what lands in the file.
 *
 * It is the SAME computed list the workbook is built from — one query, one
 * grouping, one set of counts — so the two files can never disagree.
 */
export const PackingListLineSchema = z.object({
  seq: z.number().int(),
  bookTitle: z.string(),
  quantity: z.number().int(),
  courseTitle: z.string(),
  year: z.number().int().nullable(),
  stream: z.string(),
  fullName: z.string(),
  phone: z.string(),
  altPhone: z.string(),
  governorate: z.string(),
  city: z.string(),
  street: z.string(),
  building: z.string().nullable(),
  note: z.string(),
  createdAt: z.string(),
});
export type PackingListLine = z.infer<typeof PackingListLineSchema>;

export const PackingListGroupSchema = z.object({
  /** «عربي» / «لغات» / «عربي ولغات», or empty for a line with no edition. */
  label: z.string(),
  books: z.number().int(),
  copies: z.number().int(),
  /** Per-صف inside the edition — «سنة أولى كام كتاب وكام نسخة». */
  years: z.array(z.object({ year: z.number().int().nullable(), books: z.number().int(), copies: z.number().int() })),
  lines: z.array(PackingListLineSchema),
});
export type PackingListGroup = z.infer<typeof PackingListGroupSchema>;

/**
 * ONE الصف, with its two editions under it — «كام كتاب سنة أولى، كام كتاب سنة
 * تانية».
 *
 * ## Why this exists when `groups[].years` already carries the same numbers
 *
 * It carries them the OTHER way round, and the direction is the whole point.
 * `groups` is edition-first because that is how the paper is physically
 * stacked: عربي in one pile, لغات in another, which is what a packer walks.
 * But «هنضيف سنة أولى دلوقتي، ومش عايز ألخبطها بتانية» is a question about the
 * YEAR first — two different books, two different print runs, two different
 * decisions — and answering it by adding up two numbers from two different
 * edition blocks is exactly the arithmetic that produces «واحد ناقص».
 *
 * So both orderings are computed from the same lines, in the same pass, and
 * neither is derived from the other on a screen.
 *
 * `year: null` is «من غير صف» and is a real bucket, never folded into a year:
 * a hand-typed «ملزمة مراجعة» line has no صف, and filing it under أولى would
 * be inventing one on the sheet a print run is ordered from.
 */
export const PackingListYearSchema = z.object({
  year: z.number().int().nullable(),
  /** ORDERS that have at least one line in this صف. An order spanning two
   *  years counts in BOTH, so these deliberately do not sum to `orders` — the
   *  question is «كام طلب فيه كتاب أولى», not how to partition the list. */
  orders: z.number().int(),
  books: z.number().int(),
  copies: z.number().int(),
  /** The editions inside this صف, in the sheet's own order (عربي, then لغات,
   *  then «عربي ولغات», then the unlabelled). */
  streams: z.array(
    z.object({ label: z.string(), books: z.number().int(), copies: z.number().int() }),
  ),
});
export type PackingListYear = z.infer<typeof PackingListYearSchema>;

/**
 * The short human reference a courier writes on a waybill and reads back down
 * the phone — «ك-A3F92C».
 *
 * `book_orders.id` is a uuid7: thirty-six characters, mostly a timestamp, and
 * nobody is transcribing that onto a box. There is no order NUMBER column to
 * use instead, and adding one would be a sequence to backfill and keep unique
 * across a table that already has a perfectly good unique key — so this is
 * derived from the id, deterministically, and the same order therefore carries
 * the same reference on every reprint.
 *
 * The LAST six hex characters, not the first: a uuid7 begins with the
 * millisecond it was created, so two orders placed in the same second share
 * their opening characters and the reference would not distinguish the very
 * rows most likely to be confused — the ones packed back to back.
 *
 * ⚠️ The prefix is ASCII `BK-`, and an Arabic one is NOT an option here — this
 * was `ك-` for exactly one render. A single Arabic letter in front of Latin hex
 * is a right-to-left run glued to a left-to-right one, and the bidi algorithm
 * reorders the pair no matter which direction the element declares: `ك-D9A721`
 * came out on the card as «721-كD9A». Isolation cannot fix it, because the
 * string is genuinely bidirectional; the fix is for it not to be. A reference
 * is a code, codes are transcribed character by character onto a waybill, and
 * this one is now unambiguous in either direction.
 */
export function bookOrderRef(orderId: string): string {
  return `BK-${orderId.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

/**
 * ONE PARCEL — the card that gets cut out and stuck on the box.
 *
 * Deliberately NOT `PackingListLine`: that one is per BOOK, because a desk
 * sorting a spreadsheet needs a row per title. A label is per ORDER, because
 * an order is what goes in one box — printing a separate card for each title
 * in a three-book order produces three labels for one parcel and two of them
 * end up on the wrong box or in the bin.
 *
 * It carries no money. Same reason the packing sheet dropped its price
 * columns: this goes to a courier, and a number on a box is a number somebody
 * reads as what they are owed.
 */
export const PackingLabelSchema = z.object({
  orderId: z.uuid(),
  /** See `bookOrderRef`. Precomputed server-side so the sheet, the screen and
   *  anything that ever reads this back agree on one spelling. */
  ref: z.string(),
  /** Its place in the run — the same numbering the packing sheet counts by, so
   *  «الكرت رقم ١٢» and «السطر رقم ١٢» are the same parcel. */
  seq: z.number().int(),
  fullName: z.string(),
  phone: z.string(),
  /** Empty string when none was given — «اللي بيمنع الطرد يرجع» is exactly the
   *  field that is often blank, and the card says so rather than drawing an
   *  empty labelled row. */
  altPhone: z.string(),
  governorate: z.string(),
  city: z.string(),
  street: z.string(),
  building: z.string().nullable(),
  note: z.string(),
  /**
   * Every title in this parcel with its quantity, and — since the card started
   * printing one chip PER BOOK — the صف and the edition of each.
   *
   * «اكتب في الكارد نفسه سنة أولى عربي ولا سنة أولى لغات… ممكن طالب يطلب
   * كتاب عربي سنة أولى وكتاب لغات سنة تانية». `streams` below answers «which
   * editions are in the box» but not WHICH YEAR each one is, and a box holding
   * أولى عربي + تانية لغات is exactly the box that gets packed wrong from two
   * loose chips. Same resolution chain as the sheet's own line: the BOOK's
   * year and edition, the order's course as the fallback, and null / '' when
   * neither exists — never an invented one.
   *
   * `.optional()` on the two additions so a web container that lands a minute
   * before its API during a deploy still parses the old shape.
   */
  items: z.array(
    z.object({
      title: z.string(),
      quantity: z.number().int(),
      year: z.number().int().nullable().optional(),
      stream: z.string().optional(),
    }),
  ),
  /**
   * The EDITIONS in this parcel — «عربي», «لغات», or both.
   *
   * This is what the card prints where the book titles used to go. «كتاب
   * البرمجة وعلوم الحاسب — تانية بكالوريا (لغات)» on a shipping label is a
   * long string that wraps, and the only part of it the person filling the box
   * actually acts on is the last word. The title stays on the packing sheet,
   * where there is a column for it and a desk to read it at.
   *
   * An array and not one string: a parcel really can hold one of each, and
   * picking either would be wrong on the box that most needs to be right.
   */
  streams: z.array(z.string()),
  /** Total copies in this one parcel. The number the courier counts. */
  copies: z.number().int(),
  createdAt: z.string(),
});
export type PackingLabel = z.infer<typeof PackingLabelSchema>;

export const PackingListSchema = z.object({
  groups: z.array(PackingListGroupSchema),
  /** The same lines counted صف-first instead of edition-first — see
   *  `PackingListYearSchema` for why both orderings ship. */
  years: z.array(PackingListYearSchema),
  /**
   * The ORDERS behind those lines, in the same order the sheet prints them.
   *
   * «حدّد اللي في المدى» reads this and selects exactly what the file
   * contains. It used to tick the rows RENDERED on the page instead, which is
   * one page of fifty — on a tab of fifty-two the button said «(50)» while the
   * sidebar badge said «52», and a batch «اتشحن» silently left the last two
   * behind. Ids and not a count, because the batch endpoint takes ids and the
   * point is that the selection and the spreadsheet are the same set.
   */
  orderIds: z.array(z.uuid()),
  /**
   * The orders this list LEFT OUT because they are «محجوز للمراجعة».
   *
   * ## Why the exclusion has to be reported and not just performed
   *
   * The sheet, the cards and the spreadsheet all drop a held parcel on
   * purpose, and «حدّد اللي في المدى» ticks `orderIds`, so a held order is
   * invisible to every control on the toolbar — including the bulk button that
   * exists to lift its hold. Reviewing the receipts and then pressing «راجعتهم
   * كلهم، كمّل» would clear nothing, because nothing held was ever selected.
   *
   * So the same query that removes them says WHICH it removed. One query still
   * decides the run; the ids are simply the other half of its answer.
   *
   * ⚠️ Ids only, never rows. This is not a second packing list of held orders —
   * a held parcel must not be printable from anywhere. It is the input to one
   * action: lift these holds, then ask for the list again.
   */
  heldOrderIds: z.array(z.uuid()),
  /**
   * The same orders again, one entry each, shaped for `/admin/books/labels` —
   * the cut-out cards that go on the parcels.
   *
   * A second view of `rows` rather than a second endpoint: the sheet, the
   * spreadsheet and the cards must be the same set of parcels, and the way to
   * guarantee that is for one query to produce all three. A `/labels` route of
   * its own is how the cards would one day print an order the sheet had
   * already dropped.
   */
  labels: z.array(PackingLabelSchema),
  /**
   * ORDERS, not lines. The number the admin checks the sheet against is the
   * one on the screen, and the screen counts orders while the sheet counts
   * books — «واحد ناقص» is what that difference looks like from the outside,
   * on an order that happens to contain two titles. Printing both makes the
   * comparison possible instead of a guess.
   */
  orders: z.number().int(),
  books: z.number().int(),
  copies: z.number().int(),
  /** Echoed back so the printed page can say what it is a list OF. */
  filters: z.object({
    status: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    stream: z.string().nullable(),
    year: z.number().int().nullable(),
    q: z.string().nullable(),
  }),
});
export type PackingList = z.infer<typeof PackingListSchema>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «كام نسخة، كام كتاب، كام طالب، كام عربي، كام لغات» — الأرقام فوق الشاشة.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The numbers the owner reads BEFORE he does anything on this screen, on the
 * open tab and with every filter it is showing applied.
 *
 * ## Why it is its own request and not derived from the page
 *
 * The list is paginated at fifty. Counting the rendered rows answers a
 * question about the page, not about the tab — the same mistake «حدّد اللي في
 * المدى» made when it selected fifty of fifty-two and silently left two
 * parcels unshipped. Every number here is a SQL aggregate over the whole
 * filtered set, so the header and the pager cannot disagree.
 *
 * ## Why students are counted on the PHONE
 *
 * «كام طالب» is a count of PEOPLE, and most orders on this table are guests
 * (`userId: null`) — counting distinct `userId` would report "1 student" for a
 * hundred guest orders, and counting rows would report the same person three
 * times. The phone number is the only identifier every order has and the same
 * person reuses, which is already why `previousOrdersFromPhone` counts on it.
 *
 * ## Why copies and books are both here
 *
 * They differ the moment anybody orders two, and they answer different
 * questions: «كام كتاب» is what to PRINT, «كام نسخة» is what to PACK. The
 * export has printed both since it was written; the screen printed neither.
 */
export const AdminBookOrderStreamCountsSchema = z.object({
  /** «عربي» — copies whose book serves مدارس عام. A book flagged for BOTH
   *  streams is counted in both, deliberately: it really is on sale to both,
   *  and these are two answers to «كام عربي؟» / «كام لغات؟», not a partition. */
  general: z.number().int(),
  languages: z.number().int(),
});
export type AdminBookOrderStreamCounts = z.infer<typeof AdminBookOrderStreamCountsSchema>;

export const AdminBookOrderYearOverviewSchema = z.object({
  /** `null` is «من غير صف» — a line whose book has no year and whose order has
   *  no course. Never folded into a year: see `PackingListYearSchema`. */
  year: z.number().int().nullable(),
  orders: z.number().int(),
  students: z.number().int(),
  books: z.number().int(),
  copies: z.number().int(),
  streams: AdminBookOrderStreamCountsSchema,
});
export type AdminBookOrderYearOverview = z.infer<typeof AdminBookOrderYearOverviewSchema>;

export const AdminBookOrderOverviewSchema = z.object({
  orders: z.number().int(),
  students: z.number().int(),
  books: z.number().int(),
  copies: z.number().int(),
  streams: AdminBookOrderStreamCountsSchema,
  /**
   * The same totals per صف, ascending, with «من غير صف» last.
   *
   * ⚠️ These do NOT sum to the totals above and must never be rendered as if
   * they did. An order holding a first-year book and a second-year book is one
   * order in `orders` and one order in each of two year buckets — which is the
   * honest answer to «كام طلب فيه كتاب أولى» and the wrong one to «كام طلب».
   */
  years: z.array(AdminBookOrderYearOverviewSchema),
});
export type AdminBookOrderOverview = z.infer<typeof AdminBookOrderOverviewSchema>;
