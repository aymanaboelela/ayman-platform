-- ═══════════════════════════════════════════════════════════════════════════
-- «مين كلّمني على واتساب» — the chats that already existed on the linked
-- number before the platform was linked to it.
--
-- WhatsApp pushes a new companion device a one-time history sync (the chat
-- list, recent messages, LID↔phone mappings). The sidecar reduces it to one
-- row per phone — whether a chat exists, whether a message FROM them was in
-- the synced window, how many, and when — and posts it here. No message body
-- is sent and there is no column for one.
--
-- A new table rather than columns on `wa_chats`: that table is the bot's
-- inbox (the replier answers its rows, «المهتمين» lists them, and its
-- `first_message`/`last_message` are NOT NULL bodies). Years of old chats
-- arriving there on link would fill both with people who wrote in 2024.
--
-- `phone` is the key: the only question ever asked of this table is "does
-- this number have a chat". No foreign key from `user_id` to `users`, for the
-- same reason `wa_chats.user_id` has none — it is a phone-match cache.
--
-- Purely additive: a new table and its indexes, nothing existing is touched.
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES, which
-- covers every new table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."wa_history_chats" (
    "phone" VARCHAR(20) NOT NULL,
    "user_id" TEXT,
    "who" "app"."wa_chat_who" NOT NULL DEFAULT 'lead',
    "has_chat" BOOLEAN NOT NULL DEFAULT true,
    "they_wrote" BOOLEAN NOT NULL DEFAULT false,
    "inbound_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "last_inbound_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_history_chats_pkey" PRIMARY KEY ("phone"),
    CONSTRAINT "wa_history_chats_phone_check" CHECK ("phone" ~ '^\+[0-9]{8,15}$'),
    CONSTRAINT "wa_history_chats_count_check" CHECK ("inbound_count" >= 0),
    -- They cannot have written into a chat that does not exist.
    CONSTRAINT "wa_history_chats_wrote_check" CHECK (NOT "they_wrote" OR "has_chat")
);

CREATE INDEX "wa_history_chats_user_id_idx" ON "app"."wa_history_chats"("user_id");
CREATE INDEX "wa_history_chats_synced_at_idx" ON "app"."wa_history_chats"("synced_at" DESC);
