-- ═══════════════════════════════════════════════════════════════════════════
-- «رسايل م. أيمن» — the platform speaks first, in the instructor's name.
--
-- ## What this adds, and what it deliberately does not
--
-- It adds ONE column and ONE table. There is no second messaging system here:
-- an outreach message is an ordinary `conversation_messages` row authored by
-- `admin`, inside an ordinary `conversations` row the student can answer. That
-- is the central decision of the whole feature. A student who replies to «شفت
-- نتيجتك» is replying into the inbox the instructor already reads, the reply
-- notification path already exists, and the unread dot on the assistant
-- launcher already counts admin messages the visitor has not seen. Building a
-- parallel "announcements" table would have duplicated every one of those and
-- given the student a message they could not answer.
--
-- What the new column and table exist for is the two things conversations
-- genuinely cannot express:
--
--   · `conversations.origin` — WHO SPOKE FIRST. The inbox has to answer two
--     different questions ("who is waiting on me" and "what went out under my
--     name") and no status filter can separate them: an outreach thread a
--     student replied to is `open`, exactly like a cold question.
--
--   · `outreach_messages` — WHICH WORDING WAS ALREADY USED, so the next message
--     to the same student is a different one. That is the feature's entire
--     promise («كل مرة بشكل مختلف»), and it is the one part of it that cannot
--     be derived from anything already stored.
--
-- ## Why the enum value goes in first, and why it is safe here
--
-- PostgreSQL 12+ permits ADD VALUE inside a transaction block (which is what
-- Prisma runs migrations in) provided the new label is not USED before the
-- transaction commits. Nothing below inserts a notification, so this holds —
-- and would not if it did. Same reasoning, same wording, as
-- `20260804190000_assistant_conversations`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the fifth notification kind ─────────────────────────────────────────
--
-- The only kind not caused by something the student did to the platform. That
-- is exactly why it needs one: nothing else on any screen would tell a student
-- that a message is sitting in a widget they have no reason to open.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'instructor_message';

-- ── who opened the thread ───────────────────────────────────────────────
CREATE TYPE "app"."conversation_origin" AS ENUM (
  -- المساعد escalated it. Every row that existed before this migration.
  'visitor',
  -- The platform opened it in the instructor's name.
  'outreach'
);

CREATE TYPE "app"."outreach_kind" AS ENUM (
  -- A paper was graded. Names the topics to go back to.
  'quiz_result',
  -- The lesson is finished and its quiz has never been opened.
  'quiz_nudge',
  -- A lesson with no quiz was completed. The only one that asks for nothing.
  'lesson_praise',
  -- Join the WhatsApp group. Also rides along on the other three.
  'whatsapp_invite'
);

-- DEFAULT 'visitor' rather than a backfill: the escalation path was the only
-- thing that could create a conversation before today, so every existing row
-- is already correct and no UPDATE has to touch the table at all.
ALTER TABLE "app"."conversations"
  ADD COLUMN "origin" "app"."conversation_origin" NOT NULL DEFAULT 'visitor';

-- The «اللي بعتّه» tab's ordering, and the delivery path's find-or-create.
CREATE INDEX "conversations_origin_last_message_idx"
  ON "app"."conversations" ("origin", "last_message_at" DESC);

-- An outreach thread is ALWAYS owned by an account: the platform cannot write
-- to a guest it has no user row for. Stated as a constraint rather than left to
-- the service, because a NULL here would produce a thread that appears in the
-- «اللي بعتّه» tab addressed to nobody, and the only way back would be a hand
-- written UPDATE against production.
ALTER TABLE "app"."conversations"
  ADD CONSTRAINT "conversations_outreach_has_owner"
  CHECK ("origin" <> 'outreach' OR "user_id" IS NOT NULL);

-- ── the ledger ──────────────────────────────────────────────────────────
--
-- Not the message. The message is a `conversation_messages` row; this is the
-- record of what it was and why, and the composer's only durable memory.
CREATE TABLE "app"."outreach_messages" (
  "id"      UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind"    "app"."outreach_kind" NOT NULL,

  -- Idempotency key: `attemptId` for a result, `quizId` for a nudge, an ISO
  -- week for a group invite. Unique per (user, kind) — see the index below.
  "dedupe_key" TEXT NOT NULL,

  -- `g=2|o=4|s.weak=1` — which entry of which pool. Opaque to SQL; parsed only
  -- by `compose.ts`, which reads the last few rows for a student and refuses to
  -- reuse any index it finds. Without this column every student gets the same
  -- greeting forever, and nothing anywhere would fail.
  "variant_key" TEXT NOT NULL,

  -- The numbers the body was composed FROM: score, weak topics, question
  -- numbers. Ids and numbers only, never prose — the prose is on the message
  -- row. This is what lets /admin/outreach show him not just what was said but
  -- why, and it is a SNAPSHOT: a quiz renamed next month does not rewrite the
  -- reason a message went out today.
  "facts" JSONB NOT NULL DEFAULT '{}',

  "conversation_id" UUID NOT NULL,
  "message_id"      UUID NOT NULL,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outreach_messages_pkey" PRIMARY KEY ("id")
);

-- ── keys ────────────────────────────────────────────────────────────────

-- CASCADE from the student. This table answers "which wording has this person
-- already had", and that question dies with the person. Deliberately unlike
-- `conversations.user_id`, which is SET NULL so the instructor keeps the thread
-- he already spent time on — the THREAD is a record of a conversation, this is
-- a working set.
ALTER TABLE "app"."outreach_messages"
  ADD CONSTRAINT "outreach_messages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."outreach_messages"
  ADD CONSTRAINT "outreach_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."outreach_messages"
  ADD CONSTRAINT "outreach_messages_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "app"."conversation_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── indexes ─────────────────────────────────────────────────────────────

-- One ledger row per delivered message, enforced rather than assumed.
CREATE UNIQUE INDEX "outreach_messages_message_id_key"
  ON "app"."outreach_messages" ("message_id");

-- THE IDEMPOTENCY GUARANTEE.
--
-- A grading transaction replayed after a dropped connection, two cron ticks
-- overlapping on a slow sweep, or the sweeper re-running after a deploy all
-- try to send the same message twice. This index makes the second one a
-- unique-violation the service swallows, instead of a second «شفت نتيجتك» in
-- the student's chat. It is in the DATABASE and not in a "have I already?"
-- SELECT because the SELECT has a race window and this does not.
CREATE UNIQUE INDEX "outreach_messages_dedupe_key"
  ON "app"."outreach_messages" ("user_id", "kind", "dedupe_key");

-- The composer's history read: this student's last few messages, newest first,
-- ACROSS EVERY KIND. The greeting pool is shared between kinds, so a history
-- scoped to one kind would let «إزيك يا محمد 👋» open a result and then a nudge
-- an hour later.
CREATE INDEX "outreach_messages_user_recent_idx"
  ON "app"."outreach_messages" ("user_id", "created_at" DESC);

-- The /admin/outreach log, unfiltered and filtered by kind.
CREATE INDEX "outreach_messages_recent_idx"
  ON "app"."outreach_messages" ("created_at" DESC);
CREATE INDEX "outreach_messages_kind_recent_idx"
  ON "app"."outreach_messages" ("kind", "created_at" DESC);

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner IN SCHEMA app, so ayman_runtime already holds DML on this table.
-- Same note as `20260803193000_notifications` and the conversations migration.
