-- In-app notifications. Slice 4.
--
-- There is no delivery column, no provider, no retry state and no per-channel
-- status, because nothing is ever sent anywhere: a row appearing here IS the
-- notification. Adding email or SMS later means a new table for delivery
-- attempts, not columns on this one — a notification and an attempt to deliver
-- it have different lifetimes and different failure modes.
CREATE TYPE "app"."notification_kind" AS ENUM (
  'quiz_graded',
  'appeal_resolved',
  'extra_attempt_granted'
);

-- ⚠️ No `message` column, deliberately. Rendered Arabic prose in the database
-- makes every wording fix a data migration and puts user-facing copy outside
-- `@ayman/contracts/copy`, where Global Constraint 4 requires it to live.
-- `payload` carries ids and numbers; the client composes the sentence.
CREATE TABLE "app"."notifications" (
  "id"         UUID                      NOT NULL,
  "user_id"    TEXT                      NOT NULL,
  "kind"       "app"."notification_kind" NOT NULL,
  "payload"    JSONB                     NOT NULL DEFAULT '{}',
  -- Nullable rather than a boolean: it records WHEN, which a boolean throws
  -- away for no saving. Matches `archived_at` / `revoked_at` / `completed_at`
  -- elsewhere in this schema.
  "read_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Cascade: a deleted account takes its notifications with it. This is a
-- convenience feed, not an audit trail — `audit_log` is where the permanent
-- record of what an admin did lives, and it keeps its own copy.
ALTER TABLE "app"."notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A notification cannot be read before it existed.
ALTER TABLE "app"."notifications"
  ADD CONSTRAINT "notifications_read_after_created"
  CHECK ("read_at" IS NULL OR "read_at" >= "created_at");

-- The list: newest first, straight off the index with no sort step.
CREATE INDEX "notifications_user_created_idx"
  ON "app"."notifications" ("user_id", "created_at" DESC);

-- The badge count. This is the most frequent query the table will ever take —
-- once per page load for every signed-in student — so it gets its own index
-- rather than sharing the one above, whose leading columns do not help a
-- `read_at IS NULL` filter.
CREATE INDEX "notifications_user_read_idx"
  ON "app"."notifications" ("user_id", "read_at");

-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_owner IN SCHEMA app, so ayman_runtime already has DML on anything this
-- role creates.
