-- ═══════════════════════════════════════════════════════════════════════════
-- «تصحيح الواجب في الشات» — a typed card on a conversation message.
--
-- Additive only: one nullable column, no backfill, no index, no GRANT (the
-- entrypoint's `ALTER DEFAULT PRIVILEGES` covers it, and a column inherits its
-- table's grants anyway). NULL = an ordinary message, which is every row that
-- exists today. The words stay on `body`; this only frames them — see
-- `packages/contracts/src/assistant/homework-card.ts`.
--
-- The CHECK keeps the column an OBJECT, so a JSON path read can never meet a
-- bare string or an array. What is inside the object is the contract's job
-- (`MessageCardPayloadSchema`), parsed on every read, and a row that no longer
-- parses renders as the plain bubble.
--
-- No index: the one lookup by it (`HomeworkService.review` finding the card a
-- second verdict on the same attempt should rewrite) is scoped to one
-- student's threads first, which the `conversations (user_id)` index already
-- narrows to a handful of rows.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."conversation_messages" ADD COLUMN "card" JSONB;

ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_card_is_object"
  CHECK ("card" IS NULL OR jsonb_typeof("card") = 'object');
