-- CreateEnum
CREATE TYPE "completion_source" AS ENUM ('auto', 'manual', 'dwell');

-- CreateEnum
CREATE TYPE "lesson_progress_state" AS ENUM ('not_started', 'in_progress', 'completed', 'passed', 'failed');

-- NOTE: Prisma auto-generates a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here on every `migrate dev` run, because
-- that composite FK (lessons.(section_id, course_id) -> course_sections.(id,
-- course_id)) cannot be expressed in the Prisma schema language and so is
-- invisible to its diff engine. It has been stripped from this migration by
-- hand. DO NOT let it back in — verify after every future migration with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- CreateTable
CREATE TABLE "lesson_progress" (
    "enrollment_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "completion" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "state" "lesson_progress_state" NOT NULL DEFAULT 'not_started',
    "watched_seconds" INTEGER NOT NULL DEFAULT 0,
    "max_position_seconds" INTEGER NOT NULL DEFAULT 0,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "first_opened_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_via" "completion_source",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("enrollment_id","lesson_id")
);

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_progress_enrollment_id_state_idx" ON "lesson_progress"("enrollment_id", "state");

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Hand-written CHECK constraints (Prisma has no syntax for cross-column or
-- range CHECKs). Each one is also enforced in the application layer — this is
-- the layer that survives a bug in the application. ──────────────────────────

-- Completion is a fraction, not a percentage. numeric(5,4) would happily
-- store 9.9999; only this constraint stops a bad write from making a lesson
-- 999% complete and every course average meaningless.
ALTER TABLE "app"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_completion_range"
  CHECK ("completion" >= 0 AND "completion" <= 1);

-- Neither counter can run backwards.
ALTER TABLE "app"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_seconds_nonnegative"
  CHECK ("watched_seconds" >= 0 AND "max_position_seconds" >= 0 AND "open_count" >= 0);

-- A completed lesson always records HOW it completed, and an incomplete one
-- never carries a source. This is what keeps `completed_via` analytically
-- trustworthy instead of half-populated.
ALTER TABLE "app"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_completed_has_source"
  CHECK (("completed_at" IS NULL) = ("completed_via" IS NULL));

-- A completed row must actually read as complete.
ALTER TABLE "app"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_completed_is_full"
  CHECK ("completed_at" IS NULL OR "completion" = 1);

-- Not present yet: Plan 3's entitlement_constraints migration covers
-- access_grants' own CHECKs but never bounded enrollments.progress_percent.
ALTER TABLE "app"."enrollments"
  ADD CONSTRAINT "enrollments_progress_range"
  CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100);
