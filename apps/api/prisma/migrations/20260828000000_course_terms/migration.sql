-- الترم الأول / الترم الثاني — a course's own content, split into terms, and a
-- THIRD purchase plan (alongside monthly/quarterly) that buys access to ONE
-- of them. See the `CourseTerm` model doc in schema.prisma for the full
-- reasoning; short version: a term groups existing sections (CourseSection
-- gains an optional termId), a course-wide grant (platform/course/
-- subject_teacher) is unaffected by any term's open/closed state, and closing
-- a term is enforced by bulk-revoking every live `scope: term` AccessGrant for
-- it — not by anything reading `is_open` at request time.

CREATE TABLE "app"."course_terms" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "is_open" BOOLEAN NOT NULL DEFAULT true,
  "price_cents" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "course_terms_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."course_terms"
  ADD CONSTRAINT "course_terms_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "course_terms_course_id_position_key"
  ON "app"."course_terms" ("course_id", "position");

-- A section optionally belongs to one term — grouping existing content, not a
-- new content level of its own (see the model doc).
ALTER TABLE "app"."course_sections"
  ADD COLUMN "term_id" UUID;

ALTER TABLE "app"."course_sections"
  ADD CONSTRAINT "course_sections_term_id_fkey"
    FOREIGN KEY ("term_id") REFERENCES "app"."course_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "course_sections_term_id_idx" ON "app"."course_sections" ("term_id");

-- PostgreSQL 12+ permits ADD VALUE inside a transaction block (which is what
-- Prisma runs migrations in) provided the new label is not USED before the
-- transaction commits. Nothing below inserts a grant or a submission of
-- either new value, so this holds — same reasoning as
-- `20260825190000_course_subscriptions`'s own two `ALTER TYPE` statements.
ALTER TYPE "app"."access_scope" ADD VALUE IF NOT EXISTS 'term';
ALTER TYPE "app"."payment_plan" ADD VALUE IF NOT EXISTS 'term';

ALTER TABLE "app"."access_grants"
  ADD COLUMN "term_id" UUID;

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_term_id_fkey"
    FOREIGN KEY ("term_id") REFERENCES "app"."course_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The bulk-revoke-on-close query's own index: "every live grant for THIS term".
CREATE INDEX "access_grants_term_id_idx" ON "app"."access_grants" ("term_id");

ALTER TABLE "app"."payment_submissions"
  ADD COLUMN "term_id" UUID;

ALTER TABLE "app"."payment_submissions"
  ADD CONSTRAINT "payment_submissions_term_id_fkey"
    FOREIGN KEY ("term_id") REFERENCES "app"."course_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
