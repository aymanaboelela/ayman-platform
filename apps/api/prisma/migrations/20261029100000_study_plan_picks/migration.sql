-- «خطة المذاكرة»: the student picks what in «المتراكم» the plan carries.
--
-- Two id arrays on the plan row, defaulting empty, so every existing plan
-- reads exactly as before: nothing skipped, nothing starred. Ids and not a
-- join table — see `PlanPicksSchema` for why a row that leaves the backlog
-- needs no cleanup.

ALTER TABLE "app"."study_plans"
  ADD COLUMN "skipped_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "first_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
