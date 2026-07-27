-- B3: `attempt_events.created_at` was falling through to the migration's
-- `DEFAULT CURRENT_TIMESTAMP` (20260726150032_attempts), which Postgres
-- casts through the SESSION timezone (Africa/Cairo, +3h on this deployment)
-- into this naive `timestamp(3)` column — hazard H2 (STANDING-HAZARDS.md)
-- striking again. Every other timestamp in the schema is supplied by Prisma
-- as a true UTC instant. The application fix
-- (attempt-events.service.ts) now supplies `(now() AT TIME ZONE 'UTC')`
-- explicitly, exactly like overdue.service.ts, heartbeat.service.ts and
-- content/reorder.sql.ts already do. This migration backfills the rows
-- already written on the wrong clock.
--
-- The boundary is EXACT, not estimated. Comparing each attempt's `seq = 1`
-- ("attempt_started") event against `quiz_attempts.started_at` — written by
-- Prisma in the SAME transaction and therefore unambiguously correct UTC —
-- shows an offset of ~0s for every event with id <= 117 and an offset of
-- EXACTLY 10800s (3h) for every event with id >= 8729. No row exists with an
-- id between those two values in this database. Verified by hand before
-- writing this migration:
--   SELECT e.id, EXTRACT(EPOCH FROM (e.created_at - a.started_at))
--   FROM app.attempt_events e JOIN app.quiz_attempts a ON a.id = e.attempt_id
--   WHERE e.seq = 1 ORDER BY e.id;
--
-- `attempt_events` is append-only even for the OWNER role — the trigger
-- fires regardless of grants, only `ayman_runtime`'s UPDATE/DELETE privilege
-- was revoked. Disable it for this one corrective UPDATE, exactly as
-- schema.spec.ts and quiz-fixtures.ts already do for test cleanup, and
-- re-enable it immediately after.
ALTER TABLE "app"."attempt_events" DISABLE TRIGGER "attempt_events_append_only";

UPDATE "app"."attempt_events"
SET "created_at" = "created_at" - INTERVAL '3 hours'
WHERE "id" >= 8729;

ALTER TABLE "app"."attempt_events" ENABLE TRIGGER "attempt_events_append_only";
