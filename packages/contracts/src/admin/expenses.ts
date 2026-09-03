import { z } from '@ayman/contracts/zod';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

/**
 * المصروفات — `/admin/finance`'s other half.
 *
 * The screen could say what came IN (subscriptions, book orders) and nothing at
 * all about what went out, so the number the business is actually run on —
 * «صرفت كام ودخلي كام» — was not computable anywhere on the platform.
 */

/**
 * What a spend was FOR.
 *
 * A closed set and not free text, because the whole point of the field is that
 * October's «تصوير» and November's «تصوير» add up — which they do not when one
 * of them was typed «التصوير». Ordered by how often Ayman named them.
 */
export const ExpenseCategorySchema = z.enum([
  'filming',
  'printing',
  'equipment',
  'marketing',
  'staff',
  'services',
  'other',
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

/** `YYYY-MM-DD`. A DATE on the wire, never a timestamp — see the column's own
 *  note: this figure is only ever bucketed by month, and a timestamp would
 *  invite a timezone bug into it. */
const OccurredOnSchema = z.iso.date();

/** Piastres. Positive, capped at 10,000,000 EGP — a typo of an extra three
 *  zeroes should be a field error, not a month that reports a catastrophic
 *  loss. */
const AmountCentsSchema = z.number().int().min(1).max(1_000_000_000);

export const AdminExpenseRowSchema = z.object({
  id: z.uuid(),
  occurredOn: OccurredOnSchema,
  category: ExpenseCategorySchema,
  amountCents: z.number().int(),
  titleAr: z.string(),
  noteAr: z.string().nullable(),
  /** The title a print run bought, when this row is one. */
  bookId: z.uuid().nullable(),
  bookTitleAr: z.string().nullable(),
  /** Copies bought. Never null when `bookId` is set — the database refuses the
   *  half-stated version (`expenses_book_needs_quantity`). */
  quantity: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminExpenseRow = z.infer<typeof AdminExpenseRowSchema>;

export const AdminExpenseListSchema = listResponse(AdminExpenseRowSchema);
export type AdminExpenseList = z.infer<typeof AdminExpenseListSchema>;

/**
 * ⚠️ `bookId` without `quantity` is refused HERE as well as by the CHECK, so
 * the admin meets it as a field error rather than as a 500. A row naming a
 * book with no count cannot say what it bought.
 */
const expenseWritableShape = {
  occurredOn: OccurredOnSchema,
  category: ExpenseCategorySchema,
  amountCents: AmountCentsSchema,
  titleAr: z.string().trim().min(2).max(160),
  noteAr: z.string().trim().max(2000).nullable().default(null),
  bookId: z.uuid().nullable().default(null),
  quantity: z.number().int().min(1).max(100_000).nullable().default(null),
};

const bookNeedsQuantity = (value: { bookId?: string | null; quantity?: number | null }): boolean =>
  value.bookId == null || value.quantity != null;

const BOOK_QUANTITY_REFINEMENT = {
  message: 'لازم تكتب اشتريت كام نسخة',
  path: ['quantity'],
};

export const AdminExpenseCreateSchema = z
  .object(expenseWritableShape)
  .strict()
  .refine(bookNeedsQuantity, BOOK_QUANTITY_REFINEMENT);
export type AdminExpenseCreateInput = z.infer<typeof AdminExpenseCreateSchema>;

/**
 * ⚠️ Every field optional, and `.partial()` is WRONG here for the reason
 * `partialWithoutDefaults` exists — a shape carrying `.default(null)` turns a
 * "partial" patch into one that writes nulls over fields the caller never sent.
 * Renaming an expense would clear the book it was linked to.
 */
export const AdminExpensePatchSchema = z
  .object({
    occurredOn: OccurredOnSchema.optional(),
    category: ExpenseCategorySchema.optional(),
    amountCents: AmountCentsSchema.optional(),
    titleAr: z.string().trim().min(2).max(160).optional(),
    noteAr: z.string().trim().max(2000).nullable().optional(),
    bookId: z.uuid().nullable().optional(),
    quantity: z.number().int().min(1).max(100_000).nullable().optional(),
  })
  .strict()
  .refine(bookNeedsQuantity, BOOK_QUANTITY_REFINEMENT);
export type AdminExpensePatchInput = z.infer<typeof AdminExpensePatchSchema>;

export const AdminExpenseQuerySchema = ListQuerySchema.extend({
  category: ExpenseCategorySchema.optional(),
  /**
   * `YYYY-MM` — one calendar month, the only window this ledger is ever read
   * through. A `from`/`to` pair would be more general and would also make
   * "October" three states to get wrong instead of one.
   */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'الشهر لازم يكون بالشكل YYYY-MM')
    .optional(),
}).omit({ dir: true });
export type AdminExpenseQuery = z.infer<typeof AdminExpenseQuerySchema>;

/* ── the overview ─────────────────────────────────────────────────────────── */

/** One month's line in the trend. `month` is `YYYY-MM`. */
export const FinanceMonthSchema = z.object({
  month: z.string(),
  subscriptionRevenueCents: z.number().int(),
  bookRevenueCents: z.number().int(),
  expensesCents: z.number().int(),
  /** revenue − expenses, for this month alone. May be negative — a month that
   *  bought a print run and sold nothing really did lose money, and rounding
   *  that up to zero is how a ledger starts lying. */
  netCents: z.number().int(),
});
export type FinanceMonth = z.infer<typeof FinanceMonthSchema>;

/**
 * «النظرة العامة» — the whole business on one screen.
 *
 * Every figure is all-time unless its name says otherwise, and every one is in
 * piastres. `netCents` is the only derived number that matters and it is
 * computed HERE, once, rather than by each surface that shows it — two screens
 * subtracting their own way is how «صافي الربح» ends up with two values.
 */
export const AdminFinanceOverviewSchema = z.object({
  subscriptionRevenueCents: z.number().int(),
  bookRevenueCents: z.number().int(),
  revenueTotalCents: z.number().int(),
  expensesTotalCents: z.number().int(),
  /** Spend broken down the way it was entered, so «راح فين» is answerable
   *  without opening the list. Categories with nothing in them are omitted. */
  expensesByCategory: z.array(
    z.object({ category: ExpenseCategorySchema, amountCents: z.number().int() }),
  ),
  /**
   * What the books COST, counted only for copies actually sold — quantity
   * shipped × `Book.unitCostCents`.
   *
   * ⚠️ NOT the same as the `printing` expenses, and both are real: a print run
   * is money that left this month, while this is the cost attributable to what
   * was sold. Reporting book profit as revenue − print runs would swing wildly
   * with when the printer was paid; reporting it against unit cost is what
   * «مكسب الكتب إيه» actually means.
   *
   * Titles with no `unitCostCents` contribute 0 and are counted in
   * `bookCostUnknownCount`, so a margin computed against a partly-unpriced
   * catalogue announces itself instead of quietly overstating profit.
   */
  bookCostOfSalesCents: z.number().int(),
  bookCostUnknownCount: z.number().int(),
  /** revenue − expenses. Negative is a real answer. */
  netCents: z.number().int(),
  /** Newest month first, capped by the API. */
  months: z.array(FinanceMonthSchema),
});
export type AdminFinanceOverview = z.infer<typeof AdminFinanceOverviewSchema>;
