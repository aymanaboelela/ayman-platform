-- «عرض» replaces «سعر المشتركين القدام».
--
-- «شيل الـ٢٠٠ اللي اتعمل للغات … رجّع كل حاجة زي ما كانت. عاوز أضيف عرض أو
-- خصم: سعر الكورس عادي وفيه خصم لوقت معيّن أو مفتوح، يظهر للناس بدل ما هو
-- بـ١٥٠ مثلًا يبقى ٩٩.» See `Course.saleMonthlyPriceCents`.
--
-- The returning-price columns go first. Nothing ever wrote them on any stack
-- (the prices were never set), so dropping them loses no data and no price.
-- The sale columns are all NULL: no course changes price by this file.

ALTER TABLE "app"."courses" DROP CONSTRAINT IF EXISTS "courses_returning_monthly_below_monthly";
ALTER TABLE "app"."courses" DROP CONSTRAINT IF EXISTS "courses_returning_yearly_below_yearly";
ALTER TABLE "app"."course_terms" DROP CONSTRAINT IF EXISTS "course_terms_returning_below_price";

ALTER TABLE "app"."courses"
  DROP COLUMN IF EXISTS "returning_monthly_price_cents",
  DROP COLUMN IF EXISTS "returning_yearly_price_cents",
  DROP COLUMN IF EXISTS "returning_price_before";
ALTER TABLE "app"."course_terms" DROP COLUMN IF EXISTS "returning_price_cents";

ALTER TABLE "app"."courses"
  ADD COLUMN "sale_monthly_price_cents" INTEGER,
  ADD COLUMN "sale_yearly_price_cents" INTEGER,
  ADD COLUMN "sale_ends_at" TIMESTAMP(3);

-- A sale is a real discount: below the price, and never without one.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_sale_monthly_below_monthly"
  CHECK (
    "sale_monthly_price_cents" IS NULL
    OR (
      "monthly_price_cents" IS NOT NULL
      AND "sale_monthly_price_cents" >= 0
      AND "sale_monthly_price_cents" < "monthly_price_cents"
    )
  );

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_sale_yearly_below_yearly"
  CHECK (
    "sale_yearly_price_cents" IS NULL
    OR (
      "yearly_price_cents" IS NOT NULL
      AND "sale_yearly_price_cents" >= 0
      AND "sale_yearly_price_cents" < "yearly_price_cents"
    )
  );

ALTER TABLE "app"."course_terms"
  ADD COLUMN "sale_price_cents" INTEGER;

ALTER TABLE "app"."course_terms"
  ADD CONSTRAINT "course_terms_sale_below_price"
  CHECK (
    "sale_price_cents" IS NULL
    OR (
      "price_cents" IS NOT NULL
      AND "sale_price_cents" >= 0
      AND "sale_price_cents" < "price_cents"
    )
  );
