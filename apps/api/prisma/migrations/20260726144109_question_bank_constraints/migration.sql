-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- A fraction outside [-1, 1] is always an authoring bug: 1 is "fully correct"
-- by definition, and -1 is the strongest negative marking that still lets the
-- attempt floor at 0 behave predictably.
ALTER TABLE "app"."question_options"
  ADD CONSTRAINT "question_options_fraction_range"
  CHECK ("fraction" >= -1 AND "fraction" <= 1);

-- A version number is 1-based and monotonic per entry.
ALTER TABLE "app"."question_versions"
  ADD CONSTRAINT "question_versions_version_positive"
  CHECK ("version" >= 1);

-- Immutability. A `ready` or `hidden` version is frozen: every grading-relevant
-- column is closed to UPDATE, and its options are closed to INSERT/UPDATE/DELETE.
-- Only the status column may still change (ready -> hidden retires a question
-- without touching what past attempts recorded).
CREATE OR REPLACE FUNCTION "app"."question_versions_freeze"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'draft' THEN
    IF NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."stem_html" IS DISTINCT FROM OLD."stem_html"
       OR NEW."general_feedback_html" IS DISTINCT FROM OLD."general_feedback_html"
       OR NEW."default_mark" IS DISTINCT FROM OLD."default_mark"
       OR NEW."settings" IS DISTINCT FROM OLD."settings"
       OR NEW."bank_entry_id" IS DISTINCT FROM OLD."bank_entry_id"
       OR NEW."version" IS DISTINCT FROM OLD."version"
    THEN
      RAISE EXCEPTION
        'question_version % is % and is immutable; create a new version instead',
        OLD."id", OLD."status"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "question_versions_freeze"
  BEFORE UPDATE ON "app"."question_versions"
  FOR EACH ROW EXECUTE FUNCTION "app"."question_versions_freeze"();

CREATE OR REPLACE FUNCTION "app"."question_options_freeze"()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "app"."QuestionStatus";
  parent_id TEXT;
BEGIN
  parent_id := COALESCE(NEW."question_version_id", OLD."question_version_id");
  SELECT "status" INTO parent_status
    FROM "app"."question_versions" WHERE "id" = parent_id;
  -- A cascade delete of the parent version removes the row from under us; that
  -- is legitimate, and the parent row is already gone by then.
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION
      'question_version % is % and its options are immutable', parent_id, parent_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "question_options_freeze"
  BEFORE INSERT OR UPDATE OR DELETE ON "app"."question_options"
  FOR EACH ROW EXECUTE FUNCTION "app"."question_options_freeze"();
