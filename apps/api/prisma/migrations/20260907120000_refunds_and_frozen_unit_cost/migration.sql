-- ═══════════════════════════════════════════════════════════════════════════
-- «الفلوس اللي رجعت» — a refund ledger, and a frozen unit cost on the sold line.
--
-- Two independent corrections that both exist because money was being reported
-- from rows that were never meant to answer "what did we actually keep".
--
-- ── 1. `refunds` ──────────────────────────────────────────────────────────
--
-- Cancelling a subscription was purely an ACCESS operation: `FinanceService
-- .cancel` stamped `revoked_at` and a reason on `access_grants` and touched
-- nothing else, while every revenue query aggregates `payment_submissions`
-- with no join back to the grant. So a cancelled — and refunded — subscription
-- kept 100% of its money in «إجمالي الإيرادات» and «صافي الربح» forever, and
-- because `list()` filters `revoked_at IS NULL`, the row left the only screen
-- that could edit its amount. The money became unreachable.
--
-- A separate TABLE rather than a `refunded_amount_cents` column on the two
-- source rows, for three reasons that are all about the month a figure lands in:
--
--   * A refund happens in a DIFFERENT month from the sale. September's refund
--     of a July payment must reduce September, or «شهر بشهر» restates a month
--     the owner has already closed and looked at. A column on the sale can
--     only ever reduce the sale's own month.
--   * A partial refund, and a second one after it, are both real. «رجعتله ١٠٠
--     بس» is a thing that happens on the phone.
--   * The REASON is the point. The owner asked for the deduction and the
--     explanation as one act — «تبقى تكتبها السبب ليه». A ledger row carries
--     its own reason, date and author; a column carries whatever the last
--     write left behind.
--
-- Refunds are never negative expenses. `expenses.amount_cents` is documented
-- as always positive precisely so no SUM on that table can be flipped by a
-- minus sign, and a refund is not a cost of doing business — it is revenue
-- that turned out not to be revenue. It belongs against the income it reverses.
--
-- ── 2. `book_order_items.unit_cost_cents` ─────────────────────────────────
--
-- Cost of sales was computed by joining sold lines back to `books
-- .unit_cost_cents` — the LIVE catalogue value. Two consequences, both
-- retroactive:
--
--   * Deleting a retired title (a real hard delete, `book_order_items.book_id`
--     is `ON DELETE SET NULL`) erased the cost of every copy ever sold under
--     it, instantly raising «مكسب الكتب» across all history.
--   * Repricing what a copy costs rewrote the margin of every past sale.
--
-- `unit_price_cents` beside it has always been frozen at order time for exactly
-- this reason. The cost is now frozen the same way, and the join to `books`
-- stops being load-bearing for any historical figure.
--
-- NULL means «مش معروف», the same as the catalogue column it snapshots: every
-- line that predates this migration has no answer, and those are COUNTED and
-- reported rather than silently treated as zero — a zero cost reports the whole
-- cover price as profit, which is the one wrong answer this figure must never
-- give. The backfill below therefore only fills lines whose book still carries
-- a cost today; it does not invent one.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."refunds" (
    "id" UUID NOT NULL,
    -- Exactly one of these two is set — see `refunds_one_target`. Both are
    -- `ON DELETE CASCADE`: a refund of a payment that no longer exists is not a
    -- figure anybody can interpret, and leaving it behind would deduct money
    -- from a sale the totals no longer contain.
    "submission_id" UUID,
    "book_order_id" UUID,
    -- Piastres, always positive. The SIGN lives in how this table is USED
    -- (always subtracted), never in the data — the same rule `expenses
    -- .amount_cents` follows, and for the same reason: one row entered with a
    -- minus flips a SUM nobody re-reads.
    "amount_cents" INTEGER NOT NULL,
    -- Required. «تبقى تكتبها السبب ليه» — a deduction with no explanation is
    -- one nobody can audit six months later, exactly like `expenses.title_ar`.
    "reason_ar" TEXT NOT NULL,
    -- The month the money actually LEFT, which is the month it must reduce.
    -- A DATE and not a timestamp, same convention as `expenses.occurred_on`:
    -- this is only ever bucketed by month and a timestamp invites a timezone
    -- bug into a figure the owner reconciles by hand.
    "occurred_on" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."refunds"
  ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount_cents" > 0);

-- A refund reverses ONE sale. A row naming both, or neither, cannot be
-- attributed to a revenue stream — and every figure this table feeds is
-- per-stream, so an unattributable row would land in a total without landing
-- in either of its halves.
ALTER TABLE "app"."refunds"
  ADD CONSTRAINT "refunds_one_target" CHECK (
    ("submission_id" IS NOT NULL AND "book_order_id" IS NULL)
    OR
    ("submission_id" IS NULL AND "book_order_id" IS NOT NULL)
  );

ALTER TABLE "app"."refunds"
  ADD CONSTRAINT "refunds_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "app"."payment_submissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."refunds"
  ADD CONSTRAINT "refunds_book_order_id_fkey"
  FOREIGN KEY ("book_order_id") REFERENCES "app"."book_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL`, matching every other `created_by` on this schema: deleting the
-- admin who issued a refund must not delete the refund.
ALTER TABLE "app"."refunds"
  ADD CONSTRAINT "refunds_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The month-by-month query's own index: «كل المرتجعات في الشهر ده», newest
-- first, which is the only way this table is ever scanned.
CREATE INDEX "refunds_occurred_on_idx" ON "app"."refunds"("occurred_on" DESC);
-- "what came off THIS sale" — the per-row figure both admin screens show.
CREATE INDEX "refunds_submission_id_idx" ON "app"."refunds"("submission_id");
CREATE INDEX "refunds_book_order_id_idx" ON "app"."refunds"("book_order_id");

-- ── the frozen cost ───────────────────────────────────────────────────────

ALTER TABLE "app"."book_order_items" ADD COLUMN "unit_cost_cents" INTEGER;

ALTER TABLE "app"."book_order_items"
  ADD CONSTRAINT "book_order_items_unit_cost_not_negative"
  CHECK ("unit_cost_cents" IS NULL OR "unit_cost_cents" >= 0);

-- Backfill from the catalogue as it stands TODAY. This is the best available
-- answer and it is not a perfect one: a title repriced since it was sold gets
-- its current cost, not the one in force on the day. It is strictly better than
-- the live join it replaces — which gave that same wrong answer AND changed it
-- again on every future edit — and from here forward the snapshot is taken at
-- order time and never moves.
--
-- Lines whose book is gone, or whose book has no cost, stay NULL and keep being
-- counted as «مش معروف» by the overview.
UPDATE "app"."book_order_items" i
   SET "unit_cost_cents" = b."unit_cost_cents"
  FROM "app"."books" b
 WHERE b."id" = i."book_id"
   AND b."unit_cost_cents" IS NOT NULL;
