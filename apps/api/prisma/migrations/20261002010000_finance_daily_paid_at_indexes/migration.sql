-- `FinanceDailyService.daily()` (`/admin/finance/daily`, «الفلوس والاشتراكات يوم بيوم»)
-- filters BOTH heavy tables on an expression Postgres cannot seek with an
-- ordinary index: `coalesce(reviewed_at, created_at)` on payment_submissions,
-- and `paid_at` on book_orders with no index on that column at all. Neither
-- scan is bounded by the `days` the screen asks for — `paid_rank`'s window
-- function ranks every approved, non-free submission EVER (the whole-history
-- scan the service's own comment on `PAID_AT` explains is deliberate), and
-- the outer filter on the same expression can only fall back to a row-by-row
-- `Filter` over that same set. So this endpoint was never actually bounded by
-- `days=7/30/90` — it costs roughly the same at any window, and gets slower
-- every month as approved payments accumulate. `book_orders.paid_at` has the
-- identical shape on a smaller table.
--
-- Two PARTIAL expression indexes, narrowed to exactly the predicate each
-- query already filters on (`status = 'approved' AND is_free = false` /
-- `status IN ('paid','shipped','delivered') AND deleted_at IS NULL` — see
-- `BOOK_COUNTED_SQL` in `book-revenue.ts`, reused verbatim here so the
-- planner can match it): everything outside that set never has to be
-- touched, and the expression itself is finally sargable.
--
-- Not representable as a Prisma `@@index` (no functional/partial index
-- support in `schema.prisma` for an arbitrary expression) — hand-written,
-- same as every other raw-SQL migration in this repo.
CREATE INDEX "payment_submissions_paid_at_approved_idx"
  ON "app"."payment_submissions" ((coalesce("reviewed_at", "created_at")))
  WHERE "status" = 'approved' AND "is_free" = false;

CREATE INDEX "book_orders_paid_at_counted_idx"
  ON "app"."book_orders" ("paid_at")
  WHERE "status" IN ('paid', 'shipped', 'delivered') AND "deleted_at" IS NULL;
