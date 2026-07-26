-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- The event log is INSERT-only for the running application, exactly like
-- audit_log. A compromised runtime role can still add noise; it cannot rewrite
-- or erase history, which is the property that makes a regrade defensible.
REVOKE UPDATE, DELETE ON "app"."attempt_events" FROM "ayman_runtime";

-- Belt and braces: the revoke is invisible to anyone reading schema.prisma, so
-- a trigger states the intent in the schema itself and produces a readable
-- error instead of a bare permission denial.
CREATE OR REPLACE FUNCTION "app"."attempt_events_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'attempt_events is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attempt_events_append_only"
  BEFORE UPDATE OR DELETE ON "app"."attempt_events"
  FOR EACH ROW EXECUTE FUNCTION "app"."attempt_events_append_only"();

-- At most one live appeal per question. Postgres treats NULLs as distinct, so
-- this must be a PARTIAL unique index, not a plain one.
CREATE UNIQUE INDEX "grade_appeals_one_open_per_question"
  ON "app"."grade_appeals" ("attempt_question_id")
  WHERE "status" IN ('open', 'under_review');

-- attempt_no is 1-based; a 0th attempt would silently break the attempt-limit
-- arithmetic in Task 10.
ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_attempt_no_positive" CHECK ("attempt_no" >= 1);

ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_extra_time_nonnegative"
  CHECK ("extra_time_seconds" >= 0 AND "extra_attempts" >= 0);

-- A submitted attempt must carry a submission timestamp, and vice versa.
ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_submitted_state_consistent"
  CHECK (
    ("state" IN ('submitted', 'pending_review') AND "submitted_at" IS NOT NULL)
    OR ("state" IN ('in_progress', 'overdue', 'abandoned'))
  );
