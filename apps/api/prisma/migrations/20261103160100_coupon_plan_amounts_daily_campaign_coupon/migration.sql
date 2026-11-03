-- ═══════════════════════════════════════════════════════════════════════════
-- Per-plan coupon amounts, and «كود خصم لكل يوم» on WhatsApp campaigns.
--
-- «الشهر بـ٩٩ بدل ١٥٠، والترم بـ٣٠٠ بدل ٤٥٠، والسنة من غير خصم» — one code,
-- a different amount per plan. See `CouponKindSchema` in the contracts.
--
-- Nothing existing changes meaning: every current coupon is `percent` or
-- `fixed` with the four new columns NULL, which is exactly what the rewritten
-- `coupons_amount_shape` requires of those two kinds. Every current campaign
-- has `daily_coupon` and `body_partial` NULL, which is «no code, one text» —
-- what every campaign so far was.
--
-- No GRANT: `scripts/db-bootstrap.sql`'s default privileges cover the new
-- columns. No docker-entrypoint change.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."coupons"
  ADD COLUMN "monthly_off_cents"   INTEGER,
  ADD COLUMN "quarterly_off_cents" INTEGER,
  ADD COLUMN "term_off_cents"      INTEGER,
  ADD COLUMN "yearly_off_cents"    INTEGER,
  ADD COLUMN "campaign_id"         UUID,
  ADD COLUMN "campaign_day"        VARCHAR(10);

-- Rewritten, not added beside: the old one refuses every `per_plan` row.
ALTER TABLE "app"."coupons" DROP CONSTRAINT "coupons_amount_shape";
ALTER TABLE "app"."coupons" ADD CONSTRAINT "coupons_amount_shape" CHECK (
  (
    "kind" = 'percent' AND "percent_off" BETWEEN 1 AND 99 AND "amount_off_cents" IS NULL
    AND "monthly_off_cents" IS NULL AND "quarterly_off_cents" IS NULL
    AND "term_off_cents" IS NULL AND "yearly_off_cents" IS NULL
  )
  OR (
    "kind" = 'fixed' AND "amount_off_cents" > 0 AND "amount_off_cents" % 100 = 0 AND "percent_off" IS NULL
    AND "monthly_off_cents" IS NULL AND "quarterly_off_cents" IS NULL
    AND "term_off_cents" IS NULL AND "yearly_off_cents" IS NULL
  )
  OR (
    "kind" = 'per_plan' AND "percent_off" IS NULL AND "amount_off_cents" IS NULL
    -- At least one plan, or it is a code that applies to nothing.
    AND COALESCE("monthly_off_cents", "quarterly_off_cents", "term_off_cents", "yearly_off_cents") IS NOT NULL
  )
);

-- Whole pounds, like `fixed` — InstaPay claims are matched on the exact amount.
ALTER TABLE "app"."coupons" ADD CONSTRAINT "coupons_plan_amounts_whole_pounds" CHECK (
  ("monthly_off_cents" IS NULL OR ("monthly_off_cents" > 0 AND "monthly_off_cents" % 100 = 0))
  AND ("quarterly_off_cents" IS NULL OR ("quarterly_off_cents" > 0 AND "quarterly_off_cents" % 100 = 0))
  AND ("term_off_cents" IS NULL OR ("term_off_cents" > 0 AND "term_off_cents" % 100 = 0))
  AND ("yearly_off_cents" IS NULL OR ("yearly_off_cents" > 0 AND "yearly_off_cents" % 100 = 0))
);

-- A campaign code always knows its day; the campaign itself may later be
-- deleted (SET NULL below) and the day stays as the record of when it was made.
ALTER TABLE "app"."coupons" ADD CONSTRAINT "coupons_campaign_has_day" CHECK (
  "campaign_id" IS NULL OR ("campaign_day" IS NOT NULL AND "campaign_day" ~ '^\d{4}-\d{2}-\d{2}$')
);

-- The runner's idempotency key: one code per campaign per Cairo send day,
-- whichever worker gets there first. NULLs are distinct, so hand-made coupons
-- (no campaign) are unaffected.
CREATE UNIQUE INDEX "coupons_campaign_id_campaign_day_key" ON "app"."coupons"("campaign_id", "campaign_day");

ALTER TABLE "app"."coupons" ADD CONSTRAINT "coupons_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "app"."marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."marketing_campaigns"
  ADD COLUMN "body_partial" TEXT,
  ADD COLUMN "daily_coupon" JSONB;
