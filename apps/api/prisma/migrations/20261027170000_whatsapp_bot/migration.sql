-- ═══════════════════════════════════════════════════════════════════════════
-- «الرد الآلي» — the WhatsApp auto-reply bot, «المهتمين» and the WhatsApp inbox.
--
-- `wa_chats` is one row per phone number that ever wrote to the linked device:
-- who it matched (student / parent / nobody = a lead), the lead's status and
-- year, and the bot's own state for that chat (rate limit counters, the
-- human-handoff flag, the silence window). `wa_chat_messages` is what was
-- said, both ways.
--
-- `wa_bot_answers` holds ONLY what the admin changed. Nothing seeds it: a
-- built-in answer with no row is the copy-table default, so a deploy can
-- improve a default without ever overwriting an admin's own wording (the seed
-- trap `site_settings` and `home_blocks` each fell into once).
--
-- No foreign key from `wa_chats.user_id` to `users`, deliberately: it is a
-- phone-match cache, not an owner — see the model's own note.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES, which
-- covers every new table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."wa_chat_who" AS ENUM ('student', 'parent', 'lead');
CREATE TYPE "app"."wa_lead_status" AS ENUM ('new', 'contacted', 'subscribed', 'not_interested');
CREATE TYPE "app"."wa_chat_author" AS ENUM ('contact', 'bot', 'admin', 'phone');
CREATE TYPE "app"."wa_message_status" AS ENUM ('sent', 'failed');

CREATE TABLE "app"."wa_chats" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "push_name" VARCHAR(120),
    "user_id" TEXT,
    "who" "app"."wa_chat_who" NOT NULL DEFAULT 'lead',
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "lead_status" "app"."wa_lead_status" NOT NULL DEFAULT 'new',
    "year_system" VARCHAR(40),
    "year" INTEGER,
    "year_label" VARCHAR(80),
    "intents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "converted_at" TIMESTAMP(3),
    "first_message" VARCHAR(300) NOT NULL,
    "last_message" VARCHAR(300) NOT NULL,
    "first_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_inbound_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_author" "app"."wa_chat_author" NOT NULL DEFAULT 'contact',
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "reply_due_at" TIMESTAMP(3),
    "awaiting_year" BOOLEAN NOT NULL DEFAULT false,
    "pending_intents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "year_asks" INTEGER NOT NULL DEFAULT 0,
    "last_bot_reply_at" TIMESTAMP(3),
    "bot_replies_day" VARCHAR(10),
    "bot_replies_today" INTEGER NOT NULL DEFAULT 0,
    "last_handoff_notice_at" TIMESTAMP(3),
    "human_replied_at" TIMESTAMP(3),
    "needs_human" BOOLEAN NOT NULL DEFAULT false,
    "handoff_at" TIMESTAMP(3),
    "bot_paused" BOOLEAN NOT NULL DEFAULT false,
    "muted_until" TIMESTAMP(3),
    "opted_out_at" TIMESTAMP(3),
    "admin_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_chats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wa_chats_phone_check" CHECK ("phone" ~ '^\+[0-9]{8,15}$'),
    CONSTRAINT "wa_chats_year_check" CHECK ("year" IS NULL OR "year" BETWEEN 1 AND 9),
    -- The year is the three columns together or none of them.
    CONSTRAINT "wa_chats_year_shape_check" CHECK (
      ("year" IS NULL) = ("year_system" IS NULL) AND ("year" IS NULL) = ("year_label" IS NULL)
    ),
    CONSTRAINT "wa_chats_counts_check" CHECK ("message_count" >= 0 AND "bot_replies_today" >= 0 AND "year_asks" >= 0)
);

CREATE UNIQUE INDEX "wa_chats_phone_key" ON "app"."wa_chats"("phone");
CREATE INDEX "wa_chats_needs_human_last_message_at_idx" ON "app"."wa_chats"("needs_human", "last_message_at" DESC);
CREATE INDEX "wa_chats_is_lead_last_message_at_idx" ON "app"."wa_chats"("is_lead", "last_message_at" DESC);
CREATE INDEX "wa_chats_last_message_at_idx" ON "app"."wa_chats"("last_message_at" DESC);
CREATE INDEX "wa_chats_reply_due_at_idx" ON "app"."wa_chats"("reply_due_at");
CREATE INDEX "wa_chats_user_id_idx" ON "app"."wa_chats"("user_id");

CREATE TABLE "app"."wa_chat_messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "author" "app"."wa_chat_author" NOT NULL,
    "body" TEXT NOT NULL,
    "intents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "app"."wa_message_status",
    "wa_message_id" VARCHAR(128),
    "handled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wa_chat_messages_body_check" CHECK (length("body") BETWEEN 1 AND 4000)
);

CREATE UNIQUE INDEX "wa_chat_messages_wa_message_id_key" ON "app"."wa_chat_messages"("wa_message_id");
CREATE INDEX "wa_chat_messages_chat_id_created_at_idx" ON "app"."wa_chat_messages"("chat_id", "created_at");
CREATE INDEX "wa_chat_messages_author_created_at_idx" ON "app"."wa_chat_messages"("author", "created_at");

ALTER TABLE "app"."wa_chat_messages"
  ADD CONSTRAINT "wa_chat_messages_chat_id_fkey"
  FOREIGN KEY ("chat_id") REFERENCES "app"."wa_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."wa_bot_answers" (
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(80),
    "answer" TEXT NOT NULL,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_bot_answers_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "wa_bot_answers_key_check" CHECK ("key" ~ '^([a-zA-Z]+|custom:[0-9a-f-]{36})$'),
    CONSTRAINT "wa_bot_answers_answer_check" CHECK (length("answer") BETWEEN 1 AND 1500),
    -- A custom answer is unreachable without a label to find it by on the screen.
    CONSTRAINT "wa_bot_answers_custom_label_check" CHECK ("key" NOT LIKE 'custom:%' OR "label" IS NOT NULL)
);

CREATE TABLE "app"."wa_bot_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_bot_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wa_bot_settings_singleton_check" CHECK ("id" = 1)
);

-- The send ledger (`20261027120000_whatsapp_send_ledger`, widened for `outreach`
-- in `20261027140100_checkout_intents`) names who sent each
-- message; the bot and the WhatsApp inbox are two new senders. Both count
-- toward the number's daily ceiling like everything else.
ALTER TABLE "app"."whatsapp_sends" DROP CONSTRAINT "whatsapp_sends_source_check";
ALTER TABLE "app"."whatsapp_sends" ADD CONSTRAINT "whatsapp_sends_source_check"
  CHECK ("source" IN ('campaign', 'shipping', 'outreach', 'test', 'other', 'bot', 'inbox'));
