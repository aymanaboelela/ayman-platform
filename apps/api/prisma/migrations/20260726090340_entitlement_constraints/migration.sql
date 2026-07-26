-- NOTE: Prisma's diff engine generated a DropForeignKey for
-- "lessons_section_matches_course" here. That constraint is a hand-written
-- invariant from the content_constraints migration (Task 3) — a composite FK
-- Prisma cannot express as a modelled relation, so it has no representation in
-- schema.prisma and Prisma always sees it as drift to remove. It is
-- intentionally kept: it is what makes "a lesson's denormalised course_id
-- matches its section's" structural rather than a service-layer promise.
-- Deleted from this generated migration on purpose; do not reintroduce it.

-- A grant's scope determines which target column must be populated. Without
-- this, a `platform` grant carrying a course_id reads as course-scoped to one
-- query and platform-scoped to another.
ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_scope_target" CHECK (
       ("scope" = 'platform'        AND "course_id" IS NULL     AND "subject_id" IS NULL)
    OR ("scope" = 'course'          AND "course_id" IS NOT NULL AND "subject_id" IS NULL)
    OR ("scope" = 'subject_teacher' AND "subject_id" IS NOT NULL AND "course_id" IS NULL)
    OR ("scope" = 'unassigned'      AND "course_id" IS NULL     AND "subject_id" IS NULL)
  );

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_window_ordered"
  CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

-- One live platform grant per user. Postgres treats NULLs as distinct, so this
-- has to be a PARTIAL unique index — a plain UNIQUE(user_id) would also block
-- re-granting after a revoke, which is a legitimate operation.
CREATE UNIQUE INDEX "access_grants_one_live_platform_per_user"
  ON "app"."access_grants" ("user_id")
  WHERE "scope" = 'platform' AND "revoked_at" IS NULL;
