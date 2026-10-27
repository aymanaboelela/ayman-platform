-- ═══════════════════════════════════════════════════════════════════════════
-- «الإرسال في آخر ٢٤ ساعة» — every WhatsApp message the platform sent, and
-- what WhatsApp said happened to it.
--
-- Delivery used to be visible only on campaign rows (`marketing_recipients`).
-- A shipping notice or a test send that WhatsApp refused left no trace, so
-- "is this number delivering?" had no answer covering the whole number. The
-- device page reads its 24-hour delivery rate, last delivery and refusal
-- reasons from here, and the number's own daily ceiling — every sender
-- together, ramped up over a new number's first two weeks — counts these rows.
--
-- `marketing_recipients.error_code` keeps WhatsApp's refusal code (463, 479…)
-- beside the Arabic sentence already in `error`, so failures can be grouped.
--
-- No GRANT: `ALTER DEFAULT PRIVILEGES` in the entrypoint covers new tables.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."marketing_recipients" ADD COLUMN "error_code" VARCHAR(16);

CREATE TABLE "app"."whatsapp_sends" (
  "id"           UUID NOT NULL,
  "message_id"   VARCHAR(64) NOT NULL,
  "source"       VARCHAR(16) NOT NULL,
  "to_phone"     VARCHAR(20) NOT NULL,
  "from_phone"   VARCHAR(20),
  "sent_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMP(3),
  "read_at"      TIMESTAMP(3),
  "error_code"   VARCHAR(16),
  "refused_at"   TIMESTAMP(3),
  CONSTRAINT "whatsapp_sends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_sends_source_check"
    CHECK ("source" IN ('campaign', 'shipping', 'test', 'other'))
);

CREATE UNIQUE INDEX "whatsapp_sends_message_id_key" ON "app"."whatsapp_sends"("message_id");
CREATE INDEX "whatsapp_sends_sent_at_idx" ON "app"."whatsapp_sends"("sent_at" DESC);
CREATE INDEX "whatsapp_sends_from_phone_sent_at_idx" ON "app"."whatsapp_sends"("from_phone", "sent_at");
