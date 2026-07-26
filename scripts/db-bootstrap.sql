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

-- Nothing lives in `public`, and PUBLIC gets no rights anywhere.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_owner') THEN
    CREATE ROLE ayman_owner LOGIN PASSWORD 'dev_owner_password';
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

-- Bound runaway queries and abandoned transactions on the runtime role only.
ALTER ROLE ayman_runtime SET statement_timeout = '15s';
ALTER ROLE ayman_runtime SET idle_in_transaction_session_timeout = '30s';
