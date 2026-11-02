-- «سعر المشتركين القدام» — one course, two prices: the new one for students
-- joining now, the old one for students who already paid for it.
--
-- «عاوز أزوّد سعر الكورس يبقى ٢٠٠ في الشهر … بس دا للناس الجديدة اللي مدفعتش
-- قبل كدا. الناس اللي اشتركت قبل كدا يبقى زي ما هي تدفع ١٥٠ … يبقى ظاهر إن في
-- خصم.» See `Course.returningMonthlyPriceCents` for the whole model.
--
-- Columns only, and every one NULL: no course on any stack changes price by
-- this file. The instructor sets the numbers in the course editor, and the
-- first one he sets stamps `returning_price_before`.
--
-- Each CHECK keeps the returning price a REAL discount — below the regular
-- price, and never without one. «٢٠٠ بدل ١٥٠» is a discount; «١٥٠ بدل ١٥٠» is a
-- strike-through over the same number, which reads as a mistake.

ALTER TABLE "app"."courses"
  ADD COLUMN "returning_monthly_price_cents" INTEGER,
  ADD COLUMN "returning_price_before" TIMESTAMP(3);

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_returning_monthly_below_monthly"
  CHECK (
    "returning_monthly_price_cents" IS NULL
    OR (
      "monthly_price_cents" IS NOT NULL
      AND "returning_monthly_price_cents" >= 0
      AND "returning_monthly_price_cents" < "monthly_price_cents"
    )
  );

ALTER TABLE "app"."course_terms"
  ADD COLUMN "returning_price_cents" INTEGER;

ALTER TABLE "app"."course_terms"
  ADD CONSTRAINT "course_terms_returning_below_price"
  CHECK (
    "returning_price_cents" IS NULL
    OR (
      "price_cents" IS NOT NULL
      AND "returning_price_cents" >= 0
      AND "returning_price_cents" < "price_cents"
    )
  );
