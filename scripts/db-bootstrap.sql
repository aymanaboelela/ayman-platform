-- ============================================================================
-- LOCAL DEVELOPMENT ONLY. The passwords below are intentionally hardcoded,
-- plain-text, and identical for every developer's machine. This is fine for
-- a local Postgres instance nobody else can reach, but this file MUST NOT be
-- copied into a staging or production bootstrap process as-is — production
-- roles need generated secrets pulled from a secret manager, not literals
-- committed to git.
-- ============================================================================
--
-- Three roles, least privilege. The running server can never execute DDL,
-- so a SQL-injection foothold cannot CREATE FUNCTION or DROP a table.
--   ayman_owner    → migrations only (CI / `prisma migrate`)
--   ayman_runtime  → what NestJS connects as: DML only
--   ayman_readonly → analytics
--
-- Run once as a superuser:
--   psql -d postgres -f scripts/db-bootstrap.sql

CREATE DATABASE ayman_platform_dev;

\connect ayman_platform_dev

CREATE SCHEMA IF NOT EXISTS app;

-- citext (case-insensitive text, used by student_profiles.phone/father_phone/
-- mother_phone) is a "trusted" extension since PG 13 — installable by a
-- non-superuser via a migration, but only with CREATE privilege on the
-- *database* (not just the schema). `ayman_owner` doesn't own this database
-- (this script's superuser does), so it needs that one explicit grant to
-- self-install trusted extensions through its own migrations — the actual
-- `CREATE EXTENSION citext` statement lives in the migration history, not
-- here, so a fresh environment built purely from migrations still ends up
-- correct without depending on this bootstrap step.
GRANT CREATE ON DATABASE ayman_platform_dev TO ayman_owner;

-- Nothing lives in `public`, and PUBLIC gets no rights anywhere.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_owner') THEN
    -- CREATEDB is required: `prisma migrate dev` provisions a throwaway
    -- shadow database to diff the schema against. Without it, every migration
    -- fails on a fresh setup. It grants no rights over the app's own data.
    CREATE ROLE ayman_owner LOGIN CREATEDB PASSWORD 'dev_owner_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_runtime') THEN
    CREATE ROLE ayman_runtime LOGIN PASSWORD 'dev_runtime_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_readonly') THEN
    CREATE ROLE ayman_readonly LOGIN PASSWORD 'dev_readonly_password';
  END IF;
END $$;

ALTER SCHEMA app OWNER TO ayman_owner;
GRANT USAGE ON SCHEMA app TO ayman_runtime, ayman_readonly;

-- DML only for the runtime role — note the absence of any DDL grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ayman_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ayman_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO ayman_readonly;

-- Tables created later by migrations inherit these grants automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ayman_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO ayman_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app
  GRANT SELECT ON TABLES TO ayman_readonly;

-- Append-only tables (app.attempt_events; later app.audit_log) receive
-- UPDATE/DELETE from ayman_runtime the moment they are created, via the
-- default privileges above. This script runs ONCE, as a superuser, BEFORE any
-- table exists — a REVOKE on a specific table cannot live here, it would fail
-- against an empty schema. Each such table instead gets its own
-- `REVOKE UPDATE, DELETE ON app.<table> FROM ayman_runtime;` inside the
-- migration that creates it (see 20260726150111_attempt_constraints), applied
-- immediately after the CREATE TABLE. Keep this list greppable rather than
-- clever: `grep -rn "FROM \"ayman_runtime\"" apps/api/prisma/migrations`.

-- Bound runaway queries and abandoned transactions on the runtime role only.
ALTER ROLE ayman_runtime SET statement_timeout = '15s';
ALTER ROLE ayman_runtime SET idle_in_transaction_session_timeout = '30s';

-- A migration (or a runtime query) that waits behind a long-running lock
-- blocks every write behind it. Five seconds is long enough for normal
-- contention and short enough that a stuck lock wait reports rather than
-- hangs. `ALTER ROLE ... SET` requires superuser (or CREATEROLE over that
-- role), which `ayman_owner` has neither — these three settings are
-- provisioning, not migration history, hence they live here and NOT in a
-- `prisma/migrations/*` file. A fresh environment built purely from
-- `prisma migrate deploy` will NOT have them; `db-hardening.int-spec.ts`
-- asserts `SHOW`, not just the catalogue, precisely so that omission is
-- caught rather than assumed away.
ALTER ROLE ayman_runtime SET lock_timeout = '5s';
