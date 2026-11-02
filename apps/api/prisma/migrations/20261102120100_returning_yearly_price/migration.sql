-- «سعر المشتركين القدام» for the full year too — «غير السنة بقى». Same shape
-- and same rule as `returning_monthly_price_cents` in the migration before
-- this one: NULL everywhere, and a real discount when set.

ALTER TABLE "app"."courses"
  ADD COLUMN "returning_yearly_price_cents" INTEGER;

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_returning_yearly_below_yearly"
  CHECK (
    "returning_yearly_price_cents" IS NULL
    OR (
      "yearly_price_cents" IS NOT NULL
      AND "returning_yearly_price_cents" >= 0
      AND "returning_yearly_price_cents" < "yearly_price_cents"
    )
  );
