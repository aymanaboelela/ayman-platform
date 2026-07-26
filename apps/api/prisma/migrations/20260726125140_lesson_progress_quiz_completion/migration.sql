-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- Task 2's `lesson_progress_completed_is_full` CHECK was written before quiz
-- lessons existed on this table: `completion = 1` is correct for a video/
-- text/attachment lesson finishing via `auto`/`dwell`/`manual` (those only
-- ever reach `state = 'completed'`), but Task 6's `recordQuizResult` (required
-- by Plan 5) legitimately sets `completed_at` + `completed_via = 'auto'` on a
-- PASSING quiz whose `completion` holds the scaled score — e.g. 0.8 for an
-- 80% pass — which is not 1. `state` is the discriminator: only rows in
-- `passed`/`failed` (the quiz pass/fail axis) get this exemption; a
-- `completed` row (video/text/attachment) is unaffected and still must read
-- as fully complete.
ALTER TABLE "app"."lesson_progress" DROP CONSTRAINT "lesson_progress_completed_is_full";

ALTER TABLE "app"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_completed_is_full"
  CHECK ("completed_at" IS NULL OR "completion" = 1 OR "state" IN ('passed', 'failed'));
