-- A full-YEAR subscription (سنة), a fourth plan alongside monthly/quarterly/
-- term. Unlike `term` it is date-duration-based exactly like monthly/
-- quarterly — see `Course.yearlyPriceCents` and the `PaymentPlan` enum's own
-- doc in schema.prisma. `payment-expiry.ts`'s `PLAN_MONTHS.yearly = 12` slots
-- it into the SAME `computeApprovalValidUntil` machinery monthly/quarterly
-- already use; it creates a `scope: course` grant, never `scope: term`, so
-- none of the open-ended/bulk-revoke machinery `term` needed applies here.

ALTER TABLE "app"."courses"
  ADD COLUMN "yearly_price_cents" INTEGER;

-- Widen `courses_priced_requires_grant` to also cover the new column — a
-- course for sale on ANY of the three plans must still be closed to the
-- platform-wide free grant. This does not touch `payment_plan` at all (no
-- enum value is compared here), so it is safe in the SAME migration that
-- adds the enum value below — unlike `access_grants_scope_target`
-- (20260828000001), which had to be its own migration because it compares
-- against the enum value directly.
ALTER TABLE "app"."courses" DROP CONSTRAINT "courses_priced_requires_grant";

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_priced_requires_grant"
  CHECK (
    ("monthly_price_cents" IS NULL AND "quarterly_price_cents" IS NULL AND "yearly_price_cents" IS NULL)
    OR "requires_grant"
  );

-- PostgreSQL 12+ permits ADD VALUE inside a transaction block (which is what
-- Prisma runs migrations in) provided the new label is not USED before the
-- transaction commits. Nothing above or below compares a row against
-- 'yearly', so this holds — same reasoning as `20260828000000_course_terms`'s
-- own `ALTER TYPE` statements.
ALTER TYPE "app"."payment_plan" ADD VALUE IF NOT EXISTS 'yearly';
