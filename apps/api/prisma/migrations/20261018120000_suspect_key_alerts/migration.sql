-- ═══════════════════════════════════════════════════════════════════════════
-- «الإجابة الصح غالبًا متسجّلة غلط» — the proactive half of PR #659's
-- item-analysis flag.
--
-- Additive only: one enum value and one new table. Nothing existing is
-- altered, and no row is written here — alerts are raised by submits from
-- now on (a version already suspect is caught on its next wrong-looking
-- answer).
--
-- ## ALTER TYPE in the same file
--
-- `ADD VALUE` is allowed inside a transaction as long as the new value is not
-- used before the commit, and nothing below writes a notification. Same as
-- `20260929000000_student_wallet`.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES, which
-- covers every new table.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'suspect_key';

CREATE TABLE "app"."suspect_key_alerts" (
  "question_version_id" UUID NOT NULL,
  "quiz_id"             UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suspect_key_alerts_pkey" PRIMARY KEY ("question_version_id")
);

ALTER TABLE "app"."suspect_key_alerts" ADD CONSTRAINT "suspect_key_alerts_question_version_id_fkey"
  FOREIGN KEY ("question_version_id") REFERENCES "app"."question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."suspect_key_alerts" ADD CONSTRAINT "suspect_key_alerts_quiz_id_fkey"
  FOREIGN KEY ("quiz_id") REFERENCES "app"."quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
