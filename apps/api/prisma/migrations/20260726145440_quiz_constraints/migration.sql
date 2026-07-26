-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- Exactly one of bank_entry_id / pool_id. `<>` on booleans is XOR in Postgres.
ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_source_exactly_one"
  CHECK (("bank_entry_id" IS NOT NULL) <> ("pool_id" IS NOT NULL));

ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_pinned_version_needs_entry"
  CHECK ("pinned_version" IS NULL OR "bank_entry_id" IS NOT NULL);

-- Reordering 40 questions must be ONE write of the full ordered id array
-- (spec §5.4). A non-deferrable unique makes the intermediate state of that
-- single UPDATE illegal, forcing a two-phase offset dance. Deferring the check
-- to COMMIT lets the reorder be a single statement.
--
-- Prisma's bare `@@unique([quizId, position])` created a plain UNIQUE INDEX,
-- not a named table CONSTRAINT (`\d quiz_slots` shows it under Indexes, not
-- Check/Foreign-key constraints) — so it must be dropped with DROP INDEX, not
-- ALTER TABLE ... DROP CONSTRAINT. Only a real CONSTRAINT can be DEFERRABLE.
DROP INDEX "app"."quiz_slots_quiz_id_position_key";
ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_quiz_id_position_key"
  UNIQUE ("quiz_id", "position") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_max_mark_positive" CHECK ("max_mark" > 0);

ALTER TABLE "app"."quiz_pools"
  ADD CONSTRAINT "quiz_pools_pick_count_positive" CHECK ("pick_count" >= 1);

ALTER TABLE "app"."quizzes"
  ADD CONSTRAINT "quizzes_grace_seconds_nonnegative" CHECK ("grace_seconds" >= 0);

ALTER TABLE "app"."quizzes"
  ADD CONSTRAINT "quizzes_duration_positive"
  CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0);
