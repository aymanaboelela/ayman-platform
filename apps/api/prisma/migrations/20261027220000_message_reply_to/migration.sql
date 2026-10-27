-- ═══════════════════════════════════════════════════════════════════════════
-- «اسحبها وأرد عليها» — a message may quote another one in the same thread,
-- WhatsApp style.
--
-- ## `reply_to_id`
--
-- NULL is every existing row and every message that quotes nothing. The quote
-- is JOINED at read time rather than copied into the reply, so an edit to the
-- original shows in its quotes too.
--
-- `ON DELETE SET NULL`, not CASCADE: deleting a message must not delete the
-- replies to it — they were said — but the quote has to go, or the words the
-- instructor took back would sit right there inside the next bubble.
--
-- Same-thread is the service's check, not the database's. The composite FK
-- that could say it, `(reply_to_id, conversation_id)`, would null
-- `conversation_id` too on delete.
--
-- The index is for the delete: `SET NULL` looks up referencing rows, and
-- without it every «أمسحها» scans the table.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."conversation_messages"
  ADD COLUMN "reply_to_id" UUID;

ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_reply_to_id_fkey"
  FOREIGN KEY ("reply_to_id") REFERENCES "app"."conversation_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A message cannot quote itself.
ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_reply_not_self"
  CHECK ("reply_to_id" IS NULL OR "reply_to_id" <> "id");

CREATE INDEX "conversation_messages_reply_to_id_idx"
  ON "app"."conversation_messages"("reply_to_id");
