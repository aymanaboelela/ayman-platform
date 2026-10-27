-- ═══════════════════════════════════════════════════════════════════════════
-- «فتح خطوة الدفع» — the record that makes an abandoned checkout visible.
--
-- Until now nothing recorded that a student OPENED a payment step: a
-- `payment_submissions` row exists only once a transfer is claimed, which an
-- abandoned checkout by definition never reached. One row per (student,
-- target), upserted on every opening — see `CheckoutIntent` in the schema.
--
-- `target_id` has no foreign key on purpose: it is a course id OR a book order
-- id. A deleted target simply stops matching; the sweeper re-reads it before
-- writing anything.
--
-- And the WhatsApp leg of the two automatic outreach kinds, on the ledger row
-- itself. `sent` is WhatsApp TAKING the message, not delivering it
-- (memory `whatsapp-sent-is-not-delivered`): `whatsapp_delivered_at` is the
-- arrival, written by the receipt relay that already serves campaigns.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."checkout_target" AS ENUM ('course', 'book_order');

CREATE TABLE "app"."checkout_intents" (
  "id"          UUID NOT NULL,
  "user_id"     TEXT NOT NULL,
  "target"      "app"."checkout_target" NOT NULL,
  "target_id"   UUID NOT NULL,
  "path"        TEXT NOT NULL,
  "opened_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reminded_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_intents_pkey" PRIMARY KEY ("id"),
  -- The link goes into a WhatsApp message from the instructor's number, so it
  -- must be a path on this site and nothing else.
  CONSTRAINT "checkout_intents_path_is_relative"
    CHECK ("path" LIKE '/%' AND "path" NOT LIKE '//%' AND length("path") <= 400)
);

CREATE UNIQUE INDEX "checkout_intents_user_id_target_target_id_key"
  ON "app"."checkout_intents"("user_id", "target", "target_id");

CREATE INDEX "checkout_intents_opened_at_idx" ON "app"."checkout_intents"("opened_at");

ALTER TABLE "app"."checkout_intents"
  ADD CONSTRAINT "checkout_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."outreach_messages"
  ADD COLUMN "whatsapp_status"       TEXT,
  ADD COLUMN "whatsapp_message_id"   TEXT,
  ADD COLUMN "whatsapp_delivered_at" TIMESTAMP(3),
  ADD CONSTRAINT "outreach_messages_whatsapp_status_check"
    CHECK ("whatsapp_status" IS NULL
           OR "whatsapp_status" IN ('sent', 'opted_out', 'not_on_whatsapp', 'no_phone'));

CREATE INDEX "outreach_messages_whatsapp_message_id_idx"
  ON "app"."outreach_messages"("whatsapp_message_id")
  WHERE "whatsapp_message_id" IS NOT NULL;
