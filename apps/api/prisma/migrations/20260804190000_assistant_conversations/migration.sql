-- المساعد — conversations escalated out of the assistant widget.
--
-- ⚠️ RECONSTRUCTED 2026-08-05 from the live database.
--
-- This migration was applied to the dev database on 2026-08-04 (the row is in
-- `_prisma_migrations`) but its directory was never committed, so a fresh
-- database — CI, a new clone, production — had no way to reach this state and
-- the assistant would have failed on its first query. Rebuilt by reading the
-- deployed DDL rather than rewritten from memory, so it reproduces exactly
-- what is already live.

CREATE TYPE "app"."conversation_status" AS ENUM ('open', 'answered', 'closed');
CREATE TYPE "app"."message_author" AS ENUM ('visitor', 'admin');

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'conversation_reply';

CREATE TABLE "app"."conversations" (
    "id" UUID NOT NULL,
    "user_id" TEXT,
    "guest_name" VARCHAR(120),
    "guest_phone" VARCHAR(20),
    "guest_token_hash" CHAR(64),
    "entry_path" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "app"."conversation_status" NOT NULL DEFAULT 'open',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_read_at" TIMESTAMP(3),
    "visitor_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."conversation_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "author" "app"."message_author" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_guest_token_hash_key"
    ON "app"."conversations"("guest_token_hash");
CREATE INDEX "conversations_status_activity_idx"
    ON "app"."conversations"("status", "last_message_at" DESC);
CREATE INDEX "conversations_user_idx"
    ON "app"."conversations"("user_id");
CREATE INDEX "conversation_messages_thread_idx"
    ON "app"."conversation_messages"("conversation_id", "created_at");

ALTER TABLE "app"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The three constraints Prisma cannot express, and the reason each exists.

-- Exactly one owner. A row with BOTH a user and a guest token is a thread two
-- different callers can claim — an authorization hole, not untidiness.
ALTER TABLE "app"."conversations"
    ADD CONSTRAINT "conversations_not_two_owners"
    CHECK (NOT ("user_id" IS NOT NULL AND "guest_token_hash" IS NOT NULL));

-- A guest thread with no name or phone is one nobody can ever answer.
ALTER TABLE "app"."conversations"
    ADD CONSTRAINT "conversations_guest_contactable"
    CHECK ("guest_token_hash" IS NULL
           OR ("guest_name" IS NOT NULL AND "guest_phone" IS NOT NULL));

-- Mirrors MESSAGE_MIN/MESSAGE_MAX in the contract. The database half still
-- holds if a caller ever reaches the table without the Zod pipe.
ALTER TABLE "app"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_body_length"
    CHECK (char_length("body") >= 1 AND char_length("body") <= 2000);
