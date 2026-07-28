-- Follow-up to 20260728023221_id_columns_to_uuid.
--
-- app.question_options_freeze() (from 20260726144109_question_bank_constraints)
-- declares a local `parent_id` variable as `TEXT` and compares it against
-- question_versions.id, which the previous migration just retyped to `uuid`.
-- Every INSERT/UPDATE/DELETE on question_options now fails with
-- `operator does not exist: uuid = text` inside this trigger, because
-- Postgres's uuid type has no implicit comparison operator against an
-- explicitly text-typed value (only against untyped literals). Retype the
-- variable to match; the function's own logic is unchanged.
CREATE OR REPLACE FUNCTION app.question_options_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  parent_status "app"."QuestionStatus";
  parent_id UUID;
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
$function$;
