-- ═══════════════════════════════════════════════════════════════════════════
-- «الامتحان ده على الوحدة ١ ٢ ٣»
--
-- A monthly exam is an ordinary Lesson(kind:'quiz') carrying an ordinary Quiz,
-- scheduled by quizzes.open_from / open_until, which already existed. This is
-- the ONLY new storage in the feature.
--
-- ── WHY quizzes.lesson_id STAYS @unique NOT NULL ──────────────────────────
-- Three of four independent designs proposed making it nullable so an exam
-- could own a quiz directly. It is not, and this is the evidence, because the
-- failure would be SILENT — no error, just numbers quietly going missing:
--
--   overview.service.ts        INNER JOIN lessons ON l.id = q.lesson_id
--                              at lines 208, 299, 341, 361, 379, 438, 482,
--                              531, 578
--   student-analytics.service.ts:542
--   lesson-analytics.service.ts:120, 177, 231
--   mastery.service.ts          raw CTE selecting q."lesson_id" at :96, :116
--
-- A NULL lesson_id empties every one of those. A monthly exam would vanish
-- from participation rate, mean score, item analysis and the cohort roster —
-- the admin's own dashboard, on the assessment he cares most about.
--
-- And notifications.service.ts:825 returns null for any quiz payload with no
-- lessonId, so every monthly-exam grade notice would be dropped with no error
-- anywhere. The only symptom is a student saying they were never told.
--
-- 20260802140000_course_exam's own header already argued this: "modelling it
-- as a lesson rather than as a second kind of quiz owner is what lets the
-- entire quiz engine apply to it unchanged."
--
-- ── ⚠️ prisma migrate dev WILL TRY TO UNDO TWO THINGS HERE ────────────────
-- 1. It will propose DROP CONSTRAINT on "exam_coverage_exam_in_course" and
--    "exam_coverage_covered_in_course" — composite FKs it cannot see, exactly
--    as it does for lessons_section_matches_course.
-- 2. It will propose replacing the DEFERRABLE unique below with an immediate
--    one, exactly as it does for quiz_slots_quiz_id_paper_position_key.
-- Never accept either. Re-check after any migrate run with:
--   psql -tAc "SELECT conname, condeferrable FROM pg_constraint
--              WHERE conrelid = 'app.exam_coverage'::regclass ORDER BY 1;"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."exam_coverage" (
  "exam_lesson_id"    UUID NOT NULL,
  "covered_lesson_id" UUID NOT NULL,
  "course_id"         UUID NOT NULL,
  "position"          INT  NOT NULL,
  CONSTRAINT "exam_coverage_pkey" PRIMARY KEY ("exam_lesson_id", "covered_lesson_id")
);

-- An exam is not on itself.
ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_not_self"
  CHECK ("exam_lesson_id" <> "covered_lesson_id");

ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_position_non_negative"
  CHECK ("position" >= 0);

-- DEFERRABLE so replace() can rewrite the whole ordered set in ONE statement
-- without dodging transient collisions in two phases.
ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_exam_position_key"
  UNIQUE ("exam_lesson_id", "position") DEFERRABLE INITIALLY IMMEDIATE;

-- The plain FKs Prisma models.
ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_exam_lesson_id_fkey"
  FOREIGN KEY ("exam_lesson_id") REFERENCES "app"."lessons"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_covered_lesson_id_fkey"
  FOREIGN KEY ("covered_lesson_id") REFERENCES "app"."lessons"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The two that matter, and the two Prisma cannot express: both sides of a
-- coverage row must live in the SAME course, structurally rather than by a
-- service `if`. Against lessons_id_course_key — the unique index
-- 20260802140000_course_exam created for exactly this trick.
ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_exam_in_course"
  FOREIGN KEY ("exam_lesson_id", "course_id")
  REFERENCES "app"."lessons"("id", "course_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."exam_coverage"
  ADD CONSTRAINT "exam_coverage_covered_in_course"
  FOREIGN KEY ("covered_lesson_id", "course_id")
  REFERENCES "app"."lessons"("id", "course_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "exam_coverage_covered_lesson_id_idx"
  ON "app"."exam_coverage" ("covered_lesson_id");

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- on schema `app`, so `ayman_runtime` already holds SELECT/INSERT/UPDATE/DELETE
-- on a table created here. Spelling it out would work and would also quietly
-- imply the default is not trusted.
