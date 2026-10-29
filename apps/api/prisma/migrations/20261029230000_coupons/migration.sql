-- ═══════════════════════════════════════════════════════════════════════════
-- «كوبونات الخصم» — discount codes on course subscriptions.
--
-- See `Coupon` in schema.prisma for the whole design. The two things that live
-- ONLY here, because Prisma cannot express them:
--
--   · `coupons_uses_within_max` — the ceiling, held by the database. The
--     ledger's conditional UPDATE is what normally stops the last use being
--     taken twice (it holds the row lock); this is the floor under it.
--   · `coupon_redemptions_submission_in_course` — a redemption names the same
--     course as the claim it priced, structurally, the way
--     `payment_submission_months` does.
--
-- No GRANT: `scripts/db-bootstrap.sql`'s ALTER DEFAULT PRIVILEGES covers new
-- tables. No docker-entrypoint change. Nothing existing is altered — every
-- current claim simply has no redemption.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."coupon_kind" AS ENUM ('percent', 'fixed');

CREATE TABLE "app"."coupons" (
  "id"                   UUID NOT NULL,
  "code"                 VARCHAR(32) NOT NULL,
  "kind"                 "app"."coupon_kind" NOT NULL,
  "percent_off"          INTEGER,
  "amount_off_cents"     INTEGER,
  "all_courses"          BOOLEAN NOT NULL DEFAULT true,
  "starts_at"            TIMESTAMP(3),
  "ends_at"              TIMESTAMP(3),
  "max_uses"             INTEGER,
  "max_uses_per_student" INTEGER,
  "uses_count"           INTEGER NOT NULL DEFAULT 0,
  "is_active"            BOOLEAN NOT NULL DEFAULT true,
  "note"                 VARCHAR(300),
  "created_by_user_id"   TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id"),
  -- One case on disk, so the plain UNIQUE below is case-insensitive.
  CONSTRAINT "coupons_code_shape" CHECK ("code" ~ '^[A-Z0-9_-]{3,32}$'),
  -- A percentage below 100 (a free subscription is not a code), or whole
  -- pounds — never both, never neither.
  CONSTRAINT "coupons_amount_shape" CHECK (
    ("kind" = 'percent' AND "percent_off" BETWEEN 1 AND 99 AND "amount_off_cents" IS NULL)
    OR ("kind" = 'fixed' AND "amount_off_cents" > 0 AND "amount_off_cents" % 100 = 0 AND "percent_off" IS NULL)
  ),
  CONSTRAINT "coupons_window" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "coupons_limits_positive" CHECK (
    ("max_uses" IS NULL OR "max_uses" > 0) AND ("max_uses_per_student" IS NULL OR "max_uses_per_student" > 0)
  ),
  CONSTRAINT "coupons_uses_within_max" CHECK (
    "uses_count" >= 0 AND ("max_uses" IS NULL OR "uses_count" <= "max_uses")
  )
);

CREATE UNIQUE INDEX "coupons_code_key" ON "app"."coupons"("code");
CREATE INDEX "coupons_created_at_idx" ON "app"."coupons"("created_at");

ALTER TABLE "app"."coupons" ADD CONSTRAINT "coupons_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."coupon_courses" (
  "coupon_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  CONSTRAINT "coupon_courses_pkey" PRIMARY KEY ("coupon_id", "course_id")
);

CREATE INDEX "coupon_courses_course_id_idx" ON "app"."coupon_courses"("course_id");

ALTER TABLE "app"."coupon_courses" ADD CONSTRAINT "coupon_courses_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "app"."coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."coupon_courses" ADD CONSTRAINT "coupon_courses_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."coupon_redemptions" (
  "id"             UUID NOT NULL,
  "coupon_id"      UUID NOT NULL,
  "user_id"        TEXT NOT NULL,
  "submission_id"  UUID NOT NULL,
  "course_id"      UUID NOT NULL,
  "original_cents" INTEGER NOT NULL,
  "discount_cents" INTEGER NOT NULL,
  "released_at"    TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id"),
  -- Something came off, and something is still paid.
  CONSTRAINT "coupon_redemptions_amounts" CHECK ("discount_cents" > 0 AND "discount_cents" < "original_cents")
);

CREATE UNIQUE INDEX "coupon_redemptions_submission_id_key" ON "app"."coupon_redemptions"("submission_id");
CREATE INDEX "coupon_redemptions_coupon_id_user_id_idx" ON "app"."coupon_redemptions"("coupon_id", "user_id");
CREATE INDEX "coupon_redemptions_coupon_id_created_at_idx" ON "app"."coupon_redemptions"("coupon_id", "created_at");
CREATE INDEX "coupon_redemptions_user_id_idx" ON "app"."coupon_redemptions"("user_id");
CREATE INDEX "coupon_redemptions_course_id_idx" ON "app"."coupon_redemptions"("course_id");

-- RESTRICT: a code with money history is switched off, never deleted.
ALTER TABLE "app"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "app"."coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "app"."payment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Anchored on `payment_submissions_id_course_key`. Prisma cannot see a
-- composite FK and will offer to drop it; it must stay.
ALTER TABLE "app"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_submission_in_course"
  FOREIGN KEY ("submission_id", "course_id") REFERENCES "app"."payment_submissions"("id", "course_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
