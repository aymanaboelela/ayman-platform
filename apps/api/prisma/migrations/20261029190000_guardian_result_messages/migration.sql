-- ═══════════════════════════════════════════════════════════════════════════
-- «نتيجة الامتحان لولي الأمر» — the once-per-paper ledger for the WhatsApp
-- message a guardian receives about a graded paper.
--
-- Nothing writes here until an admin sets `outreach.quizResultTo` to
-- `guardian` or `both` on a stack that holds `outreach.whatsapp`; the default
-- (`student`) is today's behaviour, so this table stays empty everywhere on
-- deploy.
--
-- `attempt_id` UNIQUE is the idempotency: the row is claimed (`sending`)
-- before the send, so a retried tick inserts nothing the second time. See
-- `GuardianResultMessage` in the schema.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."guardian_result_messages" (
  "id"                  UUID NOT NULL,
  "attempt_id"          UUID NOT NULL,
  "phone"               VARCHAR(40) NOT NULL,
  "status"              VARCHAR(16) NOT NULL,
  "whatsapp_message_id" VARCHAR(64),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardian_result_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guardian_result_messages_status_check"
    CHECK ("status" IN ('sending', 'sent', 'no_phone', 'opted_out', 'not_on_whatsapp'))
);

CREATE UNIQUE INDEX "guardian_result_messages_attempt_id_key"
  ON "app"."guardian_result_messages"("attempt_id");

CREATE INDEX "guardian_result_messages_created_at_idx"
  ON "app"."guardian_result_messages"("created_at" DESC);

ALTER TABLE "app"."guardian_result_messages"
  ADD CONSTRAINT "guardian_result_messages_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "app"."quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
