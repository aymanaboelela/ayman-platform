-- ═══════════════════════════════════════════════════════════════════════════
-- «هنا بييجي له رسالة واردة، وأصلاً أنا اللي بعتها»
--
-- `unreadForAdmin` was `lastMessageAt > adminReadAt` — "something happened here
-- since he last looked". The thing that happened is very often HIM: every
-- message bumps `last_message_at`, his own replies and «رسالة للطلبة» sends
-- included, so the moment he wrote to a student the thread jumped back onto the
-- «غير مقروءة» tab with his own words as its preview, and the sidebar badge
-- counted it. An inbox that marks your own outbox unread is an inbox nobody can
-- trust the number on.
--
-- Unread means the OTHER side spoke last. That is a fact about the newest
-- message, and the list needs it in a WHERE clause over thousands of rows.
--
-- ## Why a column and not a correlated subquery
--
-- Prisma cannot compare a message's `created_at` against a field on the parent
-- conversation — a field reference is scoped to a single model — and the
-- alternative, reading every thread and filtering in TypeScript, would break
-- the pagination the inbox list depends on. A denormalised column keeps the
-- filter a plain equality that the existing `(status, last_message_at)` indexes
-- can still serve.
--
-- It is denormalised, so it can drift. It is written in the SAME transaction as
-- `last_message_at` at every one of the three call sites that append a message —
-- if you add a fourth, write both or the tab quietly lies.
--
-- ## The backfill
--
-- Reads the real newest message per conversation. `'visitor'` as the fallback
-- covers a hand-edited row with no messages at all, which `open()` makes
-- impossible (it writes the conversation and its first message in one
-- transaction) — but a NOT NULL column needs an answer for every row, and
-- "waiting on him" is the safe way to be wrong: it shows a thread that needs
-- nothing rather than hiding one that does.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."conversations"
  ADD COLUMN "last_message_author" "app"."message_author" NOT NULL DEFAULT 'visitor';

UPDATE "app"."conversations" c
   SET "last_message_author" = m."author"
  FROM (
    SELECT DISTINCT ON ("conversation_id")
           "conversation_id", "author"
      FROM "app"."conversation_messages"
     ORDER BY "conversation_id", "created_at" DESC, "id" DESC
  ) m
 WHERE m."conversation_id" = c."id";

-- The inbox's «غير مقروءة» tab is `last_message_author = 'visitor'` AND not
-- closed AND newer than `admin_read_at`; the leading column keeps that a range
-- scan rather than a scan of every open thread.
CREATE INDEX "conversations_last_message_author_status_idx"
  ON "app"."conversations" ("last_message_author", "status", "last_message_at" DESC);
