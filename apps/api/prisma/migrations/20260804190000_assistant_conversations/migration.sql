-- المساعد — the guided assistant, and the conversations it escalates into.
--
-- There is no table here for walking the question tree, and that is the main
-- design decision in this migration. Logging every button press would grow a
-- row per interaction per visitor forever in exchange for an analytics screen
-- nobody asked for; `entry_path` on the escalation carries the same insight —
-- what the visitor was looking at when the tree ran out — in one column.

-- ── the fourth notification kind ────────────────────────────────────────
--
-- PostgreSQL 12+ permits ADD VALUE inside a transaction block (which is what
-- Prisma runs migrations in) provided the new label is not USED before the
-- transaction commits. Nothing below references it, so this is safe here and
-- would not be if this migration also inserted a notification.
--
-- IF NOT EXISTS to match `20260731061500_home_block_section_types`: it makes
-- the statement idempotent, so re-running against a partially-applied
-- database succeeds instead of aborting the whole migration.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'conversation_reply';

-- ── enums ───────────────────────────────────────────────────────────────
CREATE TYPE "app"."conversation_status" AS ENUM (
  -- Waiting on the instructor.
  'open',
  -- He replied. The visitor may still follow up, which moves it back to open.
  'answered',
  -- Done. A visitor starts a NEW thread rather than reviving this one.
  'closed'
);

CREATE TYPE "app"."message_author" AS ENUM ('visitor', 'admin');

-- ── conversations ───────────────────────────────────────────────────────
CREATE TABLE "app"."conversations" (
  "id"      UUID NOT NULL,

  -- Set for a signed-in student, NULL for a guest. Exactly one of this and
  -- `guest_token_hash` is set — see the CHECK below.
  "user_id" TEXT,

  -- What a guest typed so the instructor can reach them.
  "guest_name"  VARCHAR(120),
  "guest_phone" VARCHAR(20),

  -- SHA-256 of the opaque token in the `__Host-assistant` cookie — never the
  -- token. A dump of this table hands out no read access, because a hash
  -- cannot be replayed as a cookie. The same reason a password verifier is
  -- stored instead of a password.
  "guest_token_hash" CHAR(64),

  -- The node ids the visitor walked to get here. IDS, not sentences: the
  -- inbox resolves them to Arabic at READ time, so re-wording a question does
  -- not leave every historical row quoting the old wording — and no
  -- user-facing copy lands in the database, which Global Constraint 4 forbids.
  "entry_path" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  "status" "app"."conversation_status" NOT NULL DEFAULT 'open',

  -- Denormalised from the messages and maintained in the same transaction as
  -- the insert. The inbox orders by it on every load; deriving it would mean a
  -- correlated subquery over the message table for every row on the page.
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- When each side last read the thread. Nullable rather than boolean: it
  -- records WHEN, matching `read_at` on notifications and every other
  -- soft-state column in this schema.
  "admin_read_at"   TIMESTAMP(3),
  "visitor_read_at" TIMESTAMP(3),

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- SET NULL, not CASCADE. A student deleting their account must not erase the
-- instructor's side of a conversation he already spent time answering. The row
-- survives as an orphan and stays readable in the inbox; what it loses is the
-- link back to a record that no longer exists.
ALTER TABLE "app"."conversations"
  ADD CONSTRAINT "conversations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Never TWO owners.
--
-- A row with both a user id and a guest token has two competing claims, and
-- which one wins is decided by whichever ownership branch the service happens
-- to check first — the kind of ambiguity that reads as correct in review and
-- leaks a thread in production. Forbidden at the table, because the service is
-- not the only thing that will ever write here.
--
-- ⚠️ Deliberately NOT `exactly one`, which is the rule you would write first.
-- The FK above sets `user_id` to NULL when an account is deleted, so a
-- perfectly legitimate orphaned student thread has NEITHER — and an `exactly
-- one` check would make deleting an account fail at the constraint. That the
-- INSERT path always supplies one is the service's job, and
-- `assistant.service.spec.ts` is where it is held to it.
ALTER TABLE "app"."conversations"
  ADD CONSTRAINT "conversations_not_two_owners"
  CHECK (NOT ("user_id" IS NOT NULL AND "guest_token_hash" IS NOT NULL));

-- A guest thread is useless without a way to reach the person who opened it.
ALTER TABLE "app"."conversations"
  ADD CONSTRAINT "conversations_guest_contactable"
  CHECK (
    "guest_token_hash" IS NULL
    OR ("guest_name" IS NOT NULL AND "guest_phone" IS NOT NULL)
  );

-- ⚠️ There is deliberately NO `last_message_at >= created_at` check here, and
-- adding the obvious one back would be a bug.
--
-- `created_at` is written by POSTGRES (`CURRENT_TIMESTAMP`); the other three
-- timestamps are written by NODE (`new Date()`). Comparing them is comparing
-- two clocks, and they do not agree to the millisecond even on one machine —
-- the first draft of this migration shipped that constraint and every single
-- guest conversation failed to insert with a 23514, because the application
-- clock was a few milliseconds behind the database's.
--
-- The failure it was meant to prevent is a timestamp slightly earlier than
-- creation, which is cosmetic. The failure it caused is a rejected INSERT on
-- normal clock skew, which is an outage. `notifications_read_after_created`
-- gets away with the same shape only because nothing ever writes `read_at` in
-- the same transaction that creates the row.

-- The inbox's only ordering: filter by status, newest activity first. Both
-- columns in one index because the filter without the sort still costs a sort
-- step over everything that matched.
CREATE INDEX "conversations_status_activity_idx"
  ON "app"."conversations" ("status", "last_message_at" DESC);

-- "Has this student written before?", from their admin record.
CREATE INDEX "conversations_user_idx"
  ON "app"."conversations" ("user_id");

-- The cookie lookup. UNIQUE rather than a plain index: two rows sharing a
-- token hash would make ownership ambiguous, and a collision here is a
-- security bug rather than a data-quality one.
CREATE UNIQUE INDEX "conversations_guest_token_hash_key"
  ON "app"."conversations" ("guest_token_hash");

-- ── messages ────────────────────────────────────────────────────────────
CREATE TABLE "app"."conversation_messages" (
  "id"              UUID                    NOT NULL,
  "conversation_id" UUID                    NOT NULL,
  "author"          "app"."message_author"  NOT NULL,
  -- PLAIN TEXT, rendered into a text node at both ends. This is not a
  -- sanitised-HTML column with the sanitiser left out: there is no HTML sink
  -- anywhere on this path, and that absence is the control. Adding rich text
  -- here is the regression.
  "body"            TEXT                    NOT NULL,
  "created_at"      TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CASCADE here, unlike the user FK above: a message has no meaning at all
-- without its thread, whereas a thread keeps its meaning without its author.
ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The contract caps this at 2000 characters before the service runs. The
-- database says so too, because the contract guards one caller and the column
-- guards the table.
ALTER TABLE "app"."conversation_messages"
  ADD CONSTRAINT "conversation_messages_body_length"
  CHECK (char_length("body") BETWEEN 1 AND 2000);

-- The thread, in order, straight off the index with no sort step.
CREATE INDEX "conversation_messages_thread_idx"
  ON "app"."conversation_messages" ("conversation_id", "created_at");

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner IN SCHEMA app, so ayman_runtime already has DML on both tables.
