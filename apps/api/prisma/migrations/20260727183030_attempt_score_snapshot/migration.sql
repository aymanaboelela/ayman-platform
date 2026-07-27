-- B7: snapshot the scoring denominator (`sumMarks`, `gradeOutOf`,
-- `passPercent`) onto `quiz_attempts` at start(), exactly like `deadlineAt`
-- already is. Added nullable, backfilled from each attempt's own quiz (the
-- best available approximation for rows that predate this snapshot — every
-- attempt created from this migration forward gets the true value, resolved
-- from what the student's paper actually contained), then made NOT NULL.
--
-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift (H1, STANDING-HAZARDS.md). Stripped by hand; DO
-- NOT reintroduce it. Verify with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- AlterTable
ALTER TABLE "app"."quiz_attempts"
  ADD COLUMN "sum_marks" DECIMAL(10,4),
  ADD COLUMN "grade_out_of" DECIMAL(10,4),
  ADD COLUMN "pass_percent" DECIMAL(5,2);

UPDATE "app"."quiz_attempts" a
SET "sum_marks" = q."sum_marks",
    "grade_out_of" = q."grade_out_of",
    "pass_percent" = q."pass_percent"
FROM "app"."quizzes" q
WHERE q."id" = a."quiz_id";

ALTER TABLE "app"."quiz_attempts"
  ALTER COLUMN "sum_marks" SET NOT NULL,
  ALTER COLUMN "grade_out_of" SET NOT NULL,
  ALTER COLUMN "pass_percent" SET NOT NULL;
