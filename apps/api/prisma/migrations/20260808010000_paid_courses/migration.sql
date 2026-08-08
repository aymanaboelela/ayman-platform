-- A course can now require an access grant of its own.
--
-- `requires_grant`, NOT `is_free`, and the name is the whole point. The schema
-- carries an explicit warning against `isFree` (§6.6): entitlement must stay an
-- OBJECT with a scope and a validity window, never a boolean read off the
-- course. This column does not decide access — it decides WHICH GRANT SCOPES
-- satisfy the course:
--
--   false (every course today) → the platform-wide grant is enough
--   true                       → only a `course`- or `subject_teacher`-scoped
--                                grant opens it
--
-- `price_cents` stays reserved and stays unread. There is no payment system, so
-- writing a price would be a number nobody charges; and deriving access from it
-- is precisely the mistake the schema forbids.
ALTER TABLE "app"."courses"
  ADD COLUMN "requires_grant" BOOLEAN NOT NULL DEFAULT false;

-- Answering "which courses are closed?" is a question the admin list asks on
-- every load, and it is answered by a handful of rows out of the whole table —
-- exactly the shape a partial index serves.
CREATE INDEX "courses_requires_grant_idx"
  ON "app"."courses" ("requires_grant")
  WHERE "requires_grant" = true;
