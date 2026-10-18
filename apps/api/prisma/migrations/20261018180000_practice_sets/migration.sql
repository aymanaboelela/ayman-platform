-- ═══════════════════════════════════════════════════════════════════════════
-- «اختبارات مجانية» — public, no-account practice quizzes per lesson.
--
-- Additive only: two enums and two new tables. Nothing existing is altered and
-- no row is written, so on every stack this is a no-op until an admin creates
-- a set (and the `practice.enabled` flag gates every route besides).
--
-- ## Why CHECKs Prisma cannot see
--
-- The contract's Zod schemas are the real shape rules (2–6 distinct options,
-- a tf answer of 0|1, …). The two CHECKs below are the ones a bad write would
-- turn into a broken PUBLIC page rather than a wrong quiz: a year outside 1|2
-- has no URL to live at, and a negative answer index marks no option right.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES, which
-- covers every new table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."practice_track" AS ENUM ('arabic', 'languages');

CREATE TYPE "app"."practice_question_type" AS ENUM ('mcq', 'tf');

CREATE TABLE "app"."practice_sets" (
  "id"           UUID NOT NULL,
  "year"         INTEGER NOT NULL,
  "track"        "app"."practice_track" NOT NULL,
  "lesson_code"  TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "unit_title"   TEXT,
  "article_slug" TEXT,
  "published"    BOOLEAN NOT NULL DEFAULT false,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "practice_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_sets_year_check" CHECK ("year" IN (1, 2))
);

CREATE TABLE "app"."practice_questions" (
  "id"          UUID NOT NULL,
  "set_id"      UUID NOT NULL,
  "type"        "app"."practice_question_type" NOT NULL,
  "stem"        TEXT NOT NULL,
  "options"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  "answer"      INTEGER NOT NULL,
  "explanation" TEXT NOT NULL DEFAULT '',
  "position"    INTEGER NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "practice_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_questions_answer_check" CHECK ("answer" >= 0)
);

CREATE INDEX "practice_sets_published_year_track_idx" ON "app"."practice_sets"("published", "year", "track");

CREATE UNIQUE INDEX "practice_sets_year_track_lesson_code_key" ON "app"."practice_sets"("year", "track", "lesson_code");

CREATE INDEX "practice_questions_set_id_position_idx" ON "app"."practice_questions"("set_id", "position");

ALTER TABLE "app"."practice_questions" ADD CONSTRAINT "practice_questions_set_id_fkey"
  FOREIGN KEY ("set_id") REFERENCES "app"."practice_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
