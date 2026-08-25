-- Paid course subscriptions over Vodafone Cash: pricing on a course, and the
-- review queue a student's payment claim goes through before it becomes real
-- access.
--
-- See `Course.monthlyPriceCents` and the `PaymentSubmission` model doc in
-- schema.prisma for the full reasoning. Short version: pricing is
-- display/checkout data only — entitlement stays exactly where §6.6 put it,
-- in `AccessGrant`. Approving a submission is what creates or extends one;
-- rejecting it leaves no grant at all, and the submission row is the only
-- trace it happened.

ALTER TABLE "app"."courses"
  ADD COLUMN "monthly_price_cents" INTEGER,
  ADD COLUMN "quarterly_price_cents" INTEGER;

-- A course for sale must actually be closed to the platform-wide free grant
-- — otherwise it takes everyone's money and hands out the seat regardless.
-- Same convention as `courses_note_needs_emphasis`.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_priced_requires_grant"
  CHECK (
    ("monthly_price_cents" IS NULL AND "quarterly_price_cents" IS NULL)
    OR "requires_grant"
  );

CREATE TYPE "app"."payment_plan" AS ENUM ('monthly', 'quarterly');
CREATE TYPE "app"."payment_submission_status" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "app"."payment_submissions" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "course_id" UUID NOT NULL,
  "plan" "app"."payment_plan" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "screenshot_key" TEXT NOT NULL,
  "status" "app"."payment_submission_status" NOT NULL DEFAULT 'pending',
  "rejection_reason" TEXT,
  "reviewed_by_user_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "grant_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."payment_submissions"
  ADD CONSTRAINT "payment_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_submissions_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_submissions_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_submissions_grant_id_fkey"
    FOREIGN KEY ("grant_id") REFERENCES "app"."access_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The review queue: pending first, oldest first.
CREATE INDEX "payment_submissions_status_created_at_idx"
  ON "app"."payment_submissions" ("status", "created_at");

-- "Has this student already got one queued for this course" — the duplicate
-- check `PaymentsService.submit` runs before accepting a new submission.
CREATE INDEX "payment_submissions_user_id_course_id_status_idx"
  ON "app"."payment_submissions" ("user_id", "course_id", "status");

-- PostgreSQL 12+ permits ADD VALUE inside a transaction block (which is what
-- Prisma runs migrations in) provided the new label is not USED before the
-- transaction commits. Nothing below inserts a notification of either kind,
-- so this holds — same reasoning as `20260816120000_instructor_outreach`.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'payment_approved';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'payment_rejected';
