-- One SITTING at a lesson, not one heartbeat.
--
-- `lesson_progress` stores totals — how much of a lesson a student has ever
-- watched, how many times they opened it. Neither can answer "when did they
-- watch, and for how long THAT time", which is what the profile timeline is
-- for, and no arrangement of columns on a one-row-per-(enrollment, lesson)
-- table can: the fact being recorded is one-to-many.
--
-- Rows are written by sessionisation inside `HeartbeatService.record`'s
-- existing transaction: a heartbeat extends the open session for its pair when
-- one was last seen inside the gap, and starts a new row otherwise. A
-- heartbeat fires every 10s, so storing one row each would put a quarter of a
-- million rows behind a single 40-minute lesson.
CREATE TABLE "app"."lesson_view_sessions" (
  "id"              UUID        NOT NULL,
  "enrollment_id"   UUID        NOT NULL,
  "lesson_id"       UUID        NOT NULL,
  "started_at"      TIMESTAMP(3) NOT NULL,
  "last_seen_at"    TIMESTAMP(3) NOT NULL,
  "watched_seconds" INTEGER     NOT NULL DEFAULT 0,

  CONSTRAINT "lesson_view_sessions_pkey" PRIMARY KEY ("id")
);

-- Both FKs cascade. A revoked enrolment or a deleted lesson takes its sittings
-- with it: unlike `audit_log`, this is a convenience feed, not an audit trail,
-- and orphan rows here would surface on the timeline as an entry pointing at a
-- lesson that no longer exists.
ALTER TABLE "app"."lesson_view_sessions"
  ADD CONSTRAINT "lesson_view_sessions_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "app"."enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."lesson_view_sessions"
  ADD CONSTRAINT "lesson_view_sessions_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Watch time is accumulated from a SERVER-GRANTED delta
-- (`allowedHeartbeatSeconds`), never from the client's claim, so it can only
-- ever grow and can never go negative. The CHECK is the database saying so
-- independently of the application remembering to.
ALTER TABLE "app"."lesson_view_sessions"
  ADD CONSTRAINT "lesson_view_sessions_watched_seconds_nonneg"
  CHECK ("watched_seconds" >= 0);

-- A sitting cannot end before it began.
ALTER TABLE "app"."lesson_view_sessions"
  ADD CONSTRAINT "lesson_view_sessions_seen_after_start"
  CHECK ("last_seen_at" >= "started_at");

-- The timeline's only query shape: this student's sittings, newest first. The
-- DESC is part of the index so the feed reads straight off it and never sorts.
CREATE INDEX "lesson_view_sessions_enrollment_started_idx"
  ON "app"."lesson_view_sessions" ("enrollment_id", "started_at" DESC);

-- Serves sessionisation, which asks "is there an open sitting for this exact
-- pair" on every heartbeat — the highest-frequency authenticated write in the
-- product. Without this it is a scan on the hottest path there is.
CREATE INDEX "lesson_view_sessions_pair_last_seen_idx"
  ON "app"."lesson_view_sessions" ("enrollment_id", "lesson_id", "last_seen_at" DESC);

CREATE INDEX "lesson_view_sessions_lesson_id_idx"
  ON "app"."lesson_view_sessions" ("lesson_id");

-- No GRANT here on purpose: `scripts/db-bootstrap.sql` sets ALTER DEFAULT
-- PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app, so every table this role
-- creates is already readable and writable by ayman_runtime. An explicit
-- GRANT would work and would also quietly imply the default is not trusted.
