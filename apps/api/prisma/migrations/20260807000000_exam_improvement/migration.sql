-- ═══════════════════════════════════════════════════════════════════════════
-- One sitting per quiz, two papers on the final exam.
--
-- Three things leave: appeals (التظلمات), retakes, and practice mode. One
-- thing arrives: a `paper` dimension, so a course's improvement sitting is a
-- SECOND PAPER on the SAME quiz rather than a second quiz.
--
-- Hand-written rather than generated, for the usual reason in this repo:
-- `quiz_slots`' positional unique is DEFERRABLE and Prisma cannot express
-- that, so a generated migration would silently replace it with an immediate
-- one and break drag-reordering.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."quiz_paper" AS ENUM ('original', 'improvement');

-- ── 1. Appeals ─────────────────────────────────────────────────────────────
-- The partial unique index goes with the table it is on.
DROP TABLE IF EXISTS "app"."grade_appeals";

-- `attempt_events.kind` KEEPS its `appeal_opened` / `appeal_resolved` labels.
-- That log is append-only with UPDATE and DELETE revoked from ayman_runtime,
-- and Postgres has no ALTER TYPE … DROP VALUE — retiring the labels would mean
-- recreating the type underneath a log whose entire value is that it cannot be
-- rewritten. They are documented as retired in schema.prisma and nothing
-- writes them.
--
-- `notification_kind` is NOT in that position: notifications are a feed, not an
-- audit trail, so the type is recreated cleanly here.
DELETE FROM "app"."notifications" WHERE "kind" = 'appeal_resolved';

ALTER TYPE "app"."notification_kind" RENAME TO "notification_kind_old";
CREATE TYPE "app"."notification_kind" AS ENUM (
  'quiz_graded',
  'extra_attempt_granted',
  'conversation_reply'
);
ALTER TABLE "app"."notifications"
  ALTER COLUMN "kind" TYPE "app"."notification_kind"
  USING "kind"::text::"app"."notification_kind";
DROP TYPE "app"."notification_kind_old";

-- ── 2. Retakes and practice mode ───────────────────────────────────────────
-- Between them these four columns could express "unlimited attempts, 0h apart,
-- the last one counts, answers shown mid-attempt" — and three of the four
-- DEFAULTED that way. The allowance is now a rule in code.
ALTER TABLE "app"."quizzes"
  DROP COLUMN "mode",
  DROP COLUMN "max_attempts",
  DROP COLUMN "grade_method",
  DROP COLUMN "retry_cooldown_hours";

-- PascalCase, not snake_case. Unlike `NotificationKind`, none of these three
-- carried an `@@map`, so Prisma created them quoted-PascalCase — and an
-- `IF EXISTS` drop of the snake_case name is a silent no-op that leaves the
-- type behind, orphaned, after its column is gone.
DROP TYPE IF EXISTS "app"."QuizMode";
DROP TYPE IF EXISTS "app"."GradeMethod";
DROP TYPE IF EXISTS "app"."AppealStatus";

ALTER TABLE "app"."quizzes"
  ADD COLUMN "allows_improvement" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "improvement_sum_marks" DECIMAL(10,4) NOT NULL DEFAULT 0;

-- ── 3. The paper dimension ─────────────────────────────────────────────────
ALTER TABLE "app"."quiz_slots"
  ADD COLUMN "paper" "app"."quiz_paper" NOT NULL DEFAULT 'original';

ALTER TABLE "app"."quiz_pools"
  ADD COLUMN "paper" "app"."quiz_paper" NOT NULL DEFAULT 'original';

ALTER TABLE "app"."quiz_attempts"
  ADD COLUMN "paper" "app"."quiz_paper" NOT NULL DEFAULT 'original';

-- Numbering restarts per paper, so both papers have a question 1. Rebuilt as a
-- named CONSTRAINT (not a bare index) because only a real CONSTRAINT can be
-- DEFERRABLE — the same dance the original quiz_constraints migration does,
-- and the reason this file is hand-written.
--
-- No second index over (quiz_id, paper): this constraint's btree already
-- begins with exactly those two columns, so a lookup by them is served by its
-- leading prefix. A separate one buys no reads and costs every write.
ALTER TABLE "app"."quiz_slots"
  DROP CONSTRAINT "quiz_slots_quiz_id_position_key";
ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_quiz_id_paper_position_key"
  UNIQUE ("quiz_id", "paper", "position") DEFERRABLE INITIALLY IMMEDIATE;

-- A slot's paper must match the paper of the pool it draws from, structurally
-- rather than by a service `if`. MATCH SIMPLE (the default) means the check is
-- skipped when `pool_id` IS NULL, which is exactly right: a fixed slot has no
-- pool to agree with.
ALTER TABLE "app"."quiz_pools"
  ADD CONSTRAINT "quiz_pools_id_paper_key" UNIQUE ("id", "paper");

ALTER TABLE "app"."quiz_slots"
  ADD CONSTRAINT "quiz_slots_pool_paper_matches"
  FOREIGN KEY ("pool_id", "paper")
  REFERENCES "app"."quiz_pools" ("id", "paper")
  ON DELETE CASCADE;

-- The improvement paper is by definition never the first thing a student sits.
ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_improvement_is_not_first"
  CHECK ("paper" = 'original' OR "attempt_no" > 1);
