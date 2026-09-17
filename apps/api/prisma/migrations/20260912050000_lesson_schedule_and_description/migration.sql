-- «المحاضرة تنزل الساعة ٨» — a lecture that publishes itself, and a summary
-- the student reads AFTER watching it.
--
-- Two nullable columns on a hot table. Both are `ADD COLUMN ... NULL` with no
-- default, which Postgres does as a catalogue-only change: no table rewrite,
-- no lock held while rows are touched, so this is safe to run against the live
-- `lessons` table during the day.
--
-- ## publish_at is a SCHEDULE, not a gate
--
-- `LessonPublishSweeper` reads it once a minute, flips `is_published` when the
-- moment has passed, and clears it. Nothing on any READ path consults it —
-- `is_published` stays the single fact every catalogue query, outline, player
-- and access check already tests. That is deliberate: scheduling must not add
-- a second answer to "may this student see this lecture".
--
-- ⚠️ It is NOT the existing `visible_from` column, which is reserved for a
-- real read-time gate (Global Constraint 17) and is documented as unenforced.
-- Reusing it would leave every scheduled lecture carrying a stale value that
-- the gate would begin enforcing the day it is switched on.
--
-- `timestamptz`, unlike `quiz_attempts.deadline_at`: a publish time is a
-- wall-clock moment an instructor typed in Cairo, and keeping the offset is
-- what makes «٨ مساءً» still mean 8pm after the DST change in October.

ALTER TABLE "app"."lessons"
  ADD COLUMN "publish_at" TIMESTAMPTZ(3),
  ADD COLUMN "description" TEXT;

-- The sweeper's only query is "which lessons are due", so it reads the small
-- set of rows that have a schedule at all. A partial index keeps that a lookup
-- over the handful of scheduled lectures rather than a scan of every lesson on
-- the platform, once a minute, forever.
CREATE INDEX "lessons_publish_at_idx"
  ON "app"."lessons" ("publish_at")
  WHERE "publish_at" IS NOT NULL AND "is_published" = false;
