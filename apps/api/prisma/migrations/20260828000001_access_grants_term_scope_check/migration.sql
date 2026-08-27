-- `access_grants_scope_target` (20260726090340_entitlement_constraints) did
-- not know about the `term` scope added in the previous migration. It has to
-- be its own migration, run after that one commits: PostgreSQL refuses to let
-- a newly-added enum VALUE be used (including inside a CHECK constraint
-- Postgres validates against existing rows immediately) within the same
-- transaction that added it.
ALTER TABLE "app"."access_grants" DROP CONSTRAINT "access_grants_scope_target";

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_scope_target" CHECK (
       ("scope" = 'platform'        AND "course_id" IS NULL     AND "subject_id" IS NULL AND "term_id" IS NULL)
    OR ("scope" = 'course'          AND "course_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL)
    OR ("scope" = 'subject_teacher' AND "subject_id" IS NOT NULL AND "course_id" IS NULL AND "term_id" IS NULL)
    OR ("scope" = 'unassigned'      AND "course_id" IS NULL     AND "subject_id" IS NULL AND "term_id" IS NULL)
    -- Denormalised like `subject_teacher`'s own row: `course_id` is carried
    -- alongside `term_id` (not just derivable through it) so a plain
    -- `courseId` filter — `EntitlementService.resolveCourseAccess`'s own
    -- scopes list — finds every term grant for a course without a join.
    OR ("scope" = 'term'            AND "course_id" IS NOT NULL AND "term_id" IS NOT NULL AND "subject_id" IS NULL)
  );
