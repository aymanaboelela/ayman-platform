import { z } from '@ayman/contracts/zod';
import { PaymentPlanSchema } from '@ayman/contracts/payments';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

/**
 * «الاشتراكات والإيرادات» — `/admin/finance`.
 *
 * One row per live-or-lapsed `purchase` `AccessGrant`: who has paid, how
 * much their MOST RECENT approved submission for it was worth, and when it
 * runs out. Deliberately grant-centric rather than one row per
 * `PaymentSubmission` — a student who renewed twice has ONE subscription to
 * this course, and `/admin/payments` is already the append-only history of
 * every individual payment against it (see the model note on
 * `PaymentSubmission` for why approval extends one grant rather than
 * stacking many). This screen answers "what does he currently hold and
 * until when", not "what did he pay, one row per payment".
 *
 * Also the one screen with mutation power over that data: an admin may
 * correct a misrecorded amount, cancel early with a reason, or override the
 * dates outright — see `AdminFinanceEditAmountSchema`,
 * `AdminFinanceEditDatesSchema` and `AdminFinanceCancelSchema` below.
 */
export const FinanceStatusSchema = z.enum(['active', 'expiring_soon', 'expired']);
export type FinanceStatus = z.infer<typeof FinanceStatusSchema>;

/**
 * A single-select narrowing of the list: the four `PaymentPlan` values, plus
 * `free` — an ORTHOGONAL bucket ("admin-comped, regardless of plan") rather
 * than a fifth plan. A row may match both `free` and, say, `monthly` — this
 * is a deliberate consequence of `free` cutting across the others, not a
 * bug: "only my free/comped subscribers" is a real question independent of
 * which plan they were comped on.
 */
export const FinancePlanFilterSchema = z.enum(['monthly', 'quarterly', 'yearly', 'term', 'free']);
export type FinancePlanFilter = z.infer<typeof FinancePlanFilterSchema>;

/** «عام» / «لغات» — `Course.forGeneral`/`Course.forLanguages`, not a stored
 *  field on the row itself. */
export const FinanceStreamFilterSchema = z.enum(['general', 'languages']);
export type FinanceStreamFilter = z.infer<typeof FinanceStreamFilterSchema>;

/** Newest-paid-first (the default) or oldest-first — toggles the sort on
 *  `paidAt`, the same date the `columnPaidAt` cell already shows. A row with
 *  no `paidAt` (no approved submission behind the grant — see the field's
 *  own note) sorts last regardless of direction: neither "newest" nor
 *  "oldest" describes a payment that never happened. */
export const FinanceSortSchema = z.enum(['paid_desc', 'paid_asc']);
export type FinanceSort = z.infer<typeof FinanceSortSchema>;

export const AdminFinanceQuerySchema = ListQuerySchema.extend({
  status: FinanceStatusSchema.optional(),
  plan: FinancePlanFilterSchema.optional(),
  /** `Course.year` — 1 or 2 today, never validated against a fixed ceiling
   *  here so a future third year needs no contract change. */
  year: z.coerce.number().int().min(1).optional(),
  stream: FinanceStreamFilterSchema.optional(),
  sort: FinanceSortSchema.default('paid_desc'),
  /**
   * `ListQuerySchema.perPage` restricts this to the closed `PAGE_SIZES` set
   * (10/20/50/100) — right for a real page-size picker, wrong here.
   * `/admin/finance` is not a paginated table with a page-size control: per
   * `FinanceService.list`'s own doc, it fetches every matching grant
   * UNPAGINATED and does its own filter/sort/paginate in memory, and
   * `page.tsx` requests `perPage=200` as "comfortably more than the real
   * subscriber count" rather than a real page size. Inheriting the closed
   * set meant every request 400'd outright — the crash this screen has been
   * throwing in production, on every load, regardless of any other fix,
   * because the request that always 400s is the exact one this page always
   * sends. Widened to the same ceiling the service's own test suite already
   * measured against ("comfortably larger than this whole database's real
   * subscriber count").
   */
  perPage: z.coerce.number().int().min(1).max(2000).default(20),
}).omit({ dir: true, q: true });
export type AdminFinanceQuery = z.infer<typeof AdminFinanceQuerySchema>;

export const AdminFinanceRowSchema = z.object({
  /** The `AccessGrant` id — this row's own identity, and what every mutation
   *  below is keyed on. */
  id: z.uuid(),
  userId: z.string(),
  studentName: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** The plan and amount of the LATEST approved submission behind this
   *  grant. `null` for the handful of grants a payment never created —
   *  should not occur for a `source: purchase` row, but the join is a
   *  `findFirst`, not a guarantee. */
  plan: PaymentPlanSchema.nullable(),
  /** Set exactly when `plan = 'term'` — which term this row is for, so the
   *  screen can show it distinctly from a course-wide subscription rather
   *  than as an unlabelled row with no date. */
  termId: z.uuid().nullable(),
  termTitle: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  /** That same submission's `reviewedAt` — when an admin actually approved
   *  it, which is what "paid on" means here, and the field `sort` orders by. */
  paidAt: z.iso.datetime().nullable(),
  /** An admin-comped term — never counted in `summary.revenueTotalCents`.
   *  `null` alongside `plan`/`amountCents` for the same edge case: no
   *  approved submission behind this grant to read it from. */
  isFree: z.boolean().nullable(),
  /** `null` for a `plan: 'term'` row — it never expires by date, only by an
   *  admin closing the term (see `AccessGrant.validUntil`'s own note). */
  validUntil: z.iso.datetime().nullable(),
  /** Editable ONLY for a `scope: 'course'` row — see
   *  `AdminFinanceEditDatesSchema`'s own note on why a `term` row has none
   *  of this to edit. Exposed here (unlike on the wire before this feature)
   *  so the edit-dates panel has a starting value to prefill. */
  validFrom: z.iso.datetime(),
  scope: z.enum(['course', 'term']),
  status: FinanceStatusSchema,
  /** How many APPROVED submissions stand behind this grant, minus one — `0`
   *  for a subscription paid exactly once, `1` for a student who renewed it
   *  once, and so on. Computed per GRANT (one student's one course), which
   *  is the natural grain here: this screen is already one row per
   *  student-course subscription, not per student overall. */
  renewalCount: z.number().int().min(0),
  /** Whether this grant was cancelled early via `FinanceService.cancel`, and
   *  the admin's own reason if so — `null`/`null` for a grant that lapsed on
   *  its own `validUntil`, was never touched, or was revoked through the
   *  older student-page `adminCancelSubscription` path (which records no
   *  reason at all). Admin-visible unconditionally; `cancelReasonVisibleToStudent`
   *  is the separate question of whether the STUDENT also sees it. */
  cancelReason: z.string().nullable(),
  cancelReasonVisibleToStudent: z.boolean(),
  /**
   * «رجعله كام» — money given back against THIS subscription's payments, all
   * time, in piastres. `0` for the overwhelming majority.
   *
   * Summed across every `Refund` attached to any approved submission behind
   * the grant, not just the latest one: a student who renewed three times and
   * was refunded for the last two has both reversals here. Always positive.
   */
  refundedCents: z.number().int().min(0),
});
export type AdminFinanceRow = z.infer<typeof AdminFinanceRowSchema>;

/** Per-filter-value counts, for the count badge beside each filter chip —
 *  computed over the `status`-filtered set (so switching the status tab
 *  updates them) but INDEPENDENT of the `plan`/`year`/`stream` selections
 *  themselves, so choosing one option does not hide how many rows the
 *  others hold. Not a full cross-facet count (a `plan=monthly&year=1`
 *  double-filter's own count is not separately tracked) — deliberately the
 *  simpler of the two honest readings of "show me how many are in each
 *  bucket", see the PR description. */
export const AdminFinanceFilterCountsSchema = z.object({
  plan: z.object({
    monthly: z.number().int().min(0),
    quarterly: z.number().int().min(0),
    yearly: z.number().int().min(0),
    term: z.number().int().min(0),
    free: z.number().int().min(0),
  }),
  /** Keyed by `Course.year` as a string (JSON has no numeric keys). */
  year: z.record(z.string(), z.number().int().min(0)),
  stream: z.object({
    general: z.number().int().min(0),
    languages: z.number().int().min(0),
  }),
});
export type AdminFinanceFilterCounts = z.infer<typeof AdminFinanceFilterCountsSchema>;

/**
 * «لما أحدد فلتر، عايز أعرف الأرقام» — everything about the rows CURRENTLY on
 * screen, recomputed on every filter change.
 *
 * ## Why this is separate from the tiles above rather than replacing them
 *
 * `revenueTotalCents`, `activeCount` and `expiringSoonCount` are GLOBAL and
 * were deliberately so: they answer «المنصة عاملة إيه». This block answers a
 * different question — «الـ ٤٢ اللي قدامي دول مين» — and the two must not be
 * confused, which is why the screen labels the selection «المحدد» and shows the
 * global figure beside it whenever a filter is on.
 *
 * ## ⚠️ Two numbers here are NOT subsets of the global ones
 *
 * `revenueCents` sums the LATEST approved submission behind each matching
 * grant, because that is what the table's own «آخر دفعة» column shows and what
 * a reader adding the column up would expect. `revenueTotalCents` above sums
 * EVERY approved submission ever. So a student who renewed three times counts
 * once here and three times there, and the selection total can be smaller than
 * the global one even with no filter applied. The copy says «مجموع آخر دفعة»,
 * not «الإيراد», for exactly that reason.
 */
export const AdminFinanceSelectionSchema = z.object({
  /** Rows in the table right now — the same number as `rowCount`, restated
   *  here so a caller reading only the summary is not left to infer it. */
  subscriptionCount: z.number().int().min(0),
  /**
   * DISTINCT students behind those rows. Almost always the more useful of the
   * two and usually the one meant by «كام واحد مشترك»: one person holding a
   * term subscription AND a monthly one is two subscriptions and one student,
   * and reporting only the first overstates the cohort.
   */
  studentCount: z.number().int().min(0),
  /** Sum of the LATEST approved payment behind each matching grant, excluding
   *  comped ones. See the ⚠️ above — this is not a slice of `revenueTotalCents`. */
  revenueCents: z.number().int().min(0),
  /** Comped subscriptions in the selection — «مجاني». Counted off the same
   *  `isFree` flag the `free` plan filter uses, so the two always agree. */
  freeCount: z.number().int().min(0),
  /** The rest. `freeCount + paidCount` is `subscriptionCount` minus the
   *  handful of grants with no approved submission behind them at all, which
   *  are neither. */
  paidCount: z.number().int().min(0),
  /**
   * One entry per COURSE in the selection, biggest first.
   *
   * This is the honest answer to «كام واحد عربي وكام واحد لغات»: the streams
   * are separate COURSES with «(عربي)» / «(لغات)» in their titles, and a
   * per-course count says so without depending on anything being flagged
   * correctly. See `streamFlags` below for why that matters.
   */
  byCourse: z.array(
    z.object({
      courseId: z.uuid(),
      courseTitle: z.string(),
      subscriptionCount: z.number().int().min(0),
      studentCount: z.number().int().min(0),
      revenueCents: z.number().int().min(0),
      freeCount: z.number().int().min(0),
    }),
  ),
  /**
   * The same selection counted by `Course.forGeneral` / `Course.forLanguages`.
   *
   * ⚠️ These OVERLAP, and on real data they overlap almost completely: a course
   * may serve both streams, and `both` is how many do. Measured on the dev
   * database on 2026-09-08, 580 of 582 courses carry BOTH flags — which means
   * the «عربي / لغات» dropdown filters nothing on those rows and returns the
   * identical set either way.
   *
   * That is a labelling problem in the course rows, not a bug in this count,
   * and the screen surfaces it rather than hiding it: when `both` is the whole
   * selection it says so, and points at `byCourse` as the number to read
   * instead. Silently printing two equal numbers would be the worse answer.
   */
  streamFlags: z.object({
    general: z.number().int().min(0),
    languages: z.number().int().min(0),
    both: z.number().int().min(0),
  }),
  /** The selection broken down the way the status tabs are, so switching a
   *  plan filter still shows how many of those are live. */
  byStatus: z.object({
    active: z.number().int().min(0),
    expiringSoon: z.number().int().min(0),
    expired: z.number().int().min(0),
  }),
});
export type AdminFinanceSelection = z.infer<typeof AdminFinanceSelectionSchema>;

export const AdminFinanceSummarySchema = z.object({
  /** Sum of `amountCents` across every APPROVED submission ever, not scoped
   *  to a calendar month — Ayman's own correction: a fresh month starting
   *  the tile back at zero read as money vanishing, not as "this month's
   *  revenue starting over". Never a grant-created count — a renewal shows
   *  as its own submission, counted once per payment, same as before. */
  revenueTotalCents: z.number().int().min(0),
  /** Money given back against subscriptions, all time — see `Refund`. Always
   *  positive; it is subtracted, never stored negative. */
  refundsTotalCents: z.number().int().min(0),
  /** `revenueTotalCents − refundsTotalCents` — what actually stayed. Computed
   *  by the API so this tile and «النظرة العامة» cannot subtract two ways. */
  netRevenueTotalCents: z.number().int(),
  activeCount: z.number().int().min(0),
  expiringSoonCount: z.number().int().min(0),
  filterCounts: AdminFinanceFilterCountsSchema,
  /** Everything about the rows currently on screen — see the schema's own
   *  note on why this is beside the global tiles rather than instead of them. */
  selection: AdminFinanceSelectionSchema,
});
export type AdminFinanceSummary = z.infer<typeof AdminFinanceSummarySchema>;

export const AdminFinanceListSchema = listResponse(AdminFinanceRowSchema).extend({
  summary: AdminFinanceSummarySchema,
});
export type AdminFinanceList = z.infer<typeof AdminFinanceListSchema>;

/**
 * «القيمة اللي اتسجلت غلط» — an admin correcting what a submission actually
 * collected, after the fact. Edits the LATEST approved `PaymentSubmission`
 * behind the grant directly (the exact row `AdminFinanceRow.amountCents`
 * reads from) — there is no separate "collected" column to edit instead.
 * `isFree` travels alongside `amountCents` rather than as its own endpoint:
 * "the student actually never paid" and "he paid a different amount" are the
 * same correction — what this submission really collected — just at
 * opposite ends, and splitting them would need two round trips for one
 * admin decision.
 */
export const AdminFinanceEditAmountSchema = z
  .object({
    amountCents: z.number().int().min(0),
    isFree: z.boolean(),
  })
  .strict();
export type AdminFinanceEditAmountInput = z.infer<typeof AdminFinanceEditAmountSchema>;

/**
 * «أنا سوبر أدمن، أعمل اللي أنا عايزه» — direct, unguarded override of a
 * `scope: 'course'` grant's window. `validUntil: null` reopens it
 * open-ended; a past date takes effect immediately, the same live re-check
 * `LessonAccessService.require` already runs on every lesson open.
 *
 * Rejected outright for a `scope: 'term'` row: that grant's `validUntil` is
 * ALWAYS `null` by construction (see the model doc) and is cut off by
 * `revokedAt` alone, not a date — there is no calendar window on it for this
 * endpoint to change. `FinanceService.editDates` 400s rather than silently
 * accepting a value it cannot make take effect.
 */
export const AdminFinanceEditDatesSchema = z
  .object({
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime().nullable(),
  })
  .strict();
export type AdminFinanceEditDatesInput = z.infer<typeof AdminFinanceEditDatesSchema>;

/**
 * Ending a subscription before its natural expiry, with a reason — modelled
 * on `PaymentsService.adminCancelSubscription`'s existing stamp-`revokedAt`
 * pattern, plus the two fields that pattern never needed: the reason itself,
 * and whether the STUDENT ever sees it. `showToStudent: false` (the
 * default) keeps the reason admin-only, exactly like every cancellation
 * before this feature — typing a reason must never make it student-visible
 * by accident.
 */
export const AdminFinanceCancelSchema = z
  .object({
    reason: z.string().trim().min(1).max(400),
    showToStudent: z.boolean().default(false),
    /**
     * «رجعتله فلوسه» — how much came back, in piastres, or `null` for «مرجعتش».
     *
     * A SEPARATE decision from cancelling, and deliberately not implied by it.
     * Ending a subscription because the student cheated keeps every pound; the
     * money only leaves the books when the owner says it did. Folding the two
     * together would make every disciplinary cancellation silently restate
     * revenue downwards.
     *
     * When set, this writes a `Refund` row dated TODAY against the latest
     * approved submission behind the grant — so it reduces the month the money
     * actually went back in, not the month of the original sale. `reason` above
     * travels onto that row: the owner is already saying why, and asking him to
     * type it twice is how one of the two ends up blank.
     *
     * Bounded by the submission's own `amountCents` server-side — refunding
     * more than was collected is a typo, and one that would report negative
     * revenue for the stream.
     */
    refundCents: z.number().int().min(1).nullable().default(null),
  })
  .strict();
export type AdminFinanceCancelInput = z.infer<typeof AdminFinanceCancelSchema>;
