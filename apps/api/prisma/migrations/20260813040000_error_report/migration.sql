-- ═══════════════════════════════════════════════════════════════════════════
-- The error log — what actually broke for a student, and how often.
--
-- ## Why this table exists
--
-- `apps/web/lib/report-error.ts` said it plainly, and it was checked before it
-- was written: there is no client error reporting in this repo. No Sentry, no
-- PostHog, no Bugsnag, no RUM, no `instrumentation.ts` and therefore no
-- `onRequestError`. `console.error` was the entire sink, and it is only ever
-- read by someone holding the device with devtools open.
--
-- So a failure had two possible fates. A Server Component throw reached the
-- container log, where nobody looks until something is already known to be
-- wrong. A CLIENT render error reached nothing at all. Either way the
-- instructor's only signal was a student telling him — «حصل بييجي للناس 404 يا
-- عم» is what that looks like from his side, days late and without a route, a
-- device or a count.
--
-- ## One row per DISTINCT failure, not per victim
--
-- `fingerprint` is UNIQUE and every report upserts onto it, incrementing
-- `occurrences`. That is the whole design, and it is chosen against the shape
-- of this product's outages: when the API is briefly unreachable it takes out
-- every page view in that window, so a table that grew per view would answer
-- "how many students hit this" by becoming unreadable. A short list of
-- distinct problems, ordered by how recently each happened, is the thing that
-- can be opened on a phone during an incident.
--
-- `first_seen_at` is therefore not redundant with `last_seen_at`: the gap
-- between them is how long a fault has been live, which is usually the
-- diagnosis.
--
-- ## What is deliberately absent
--
-- No IP address and no request body, unlike `audit_log` next door — that table
-- records deliberate acts by identified people and needs to be able to prove
-- who; this one records accidents and needs only to be able to reproduce them.
-- `user_id` is nullable and stays NULL for a signed-out visitor, because a
-- stranger hitting a broken course page from a WhatsApp link is exactly the
-- report nobody files by hand. `user_agent` is kept because "only on iOS
-- Safari" is a diagnosis and nothing else here can express it.
--
-- Nothing in here is ever deleted by the application: `resolved_at` is set and
-- cleared instead. A fault that comes back is worth seeing AS a fault that
-- came back, and `DiagnosticsService.record()` clears the flag on any fresh
-- occurrence for that reason.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "app"."error_report" (
    "id" BIGSERIAL NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" TEXT NOT NULL,
    "digest" TEXT,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "error_report_pkey" PRIMARY KEY ("id")
);

-- The grouping key. UNIQUE is load-bearing rather than defensive: it is what
-- `upsert` targets, and it is what makes two students hitting the same outage
-- in the same second collapse into one row instead of racing for two.
-- CreateIndex
CREATE UNIQUE INDEX "error_report_fingerprint_key" ON "app"."error_report"("fingerprint");

-- The default view: most recently seen first.
-- CreateIndex
CREATE INDEX "error_report_last_seen_at_idx" ON "app"."error_report"("last_seen_at");

-- The open/resolved filter, which is the one the page actually opens on.
-- CreateIndex
CREATE INDEX "error_report_resolved_at_last_seen_at_idx" ON "app"."error_report"("resolved_at", "last_seen_at");

-- No GRANT here, and none is missing. `scripts/db-bootstrap.sql` sets
-- ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app for both TABLES
-- and SEQUENCES, so `ayman_runtime` already holds DML on this table and
-- USAGE/SELECT on `error_report_id_seq`. The explicit sequence grant in
-- `20260727024705_platform_config` for `audit_log` is not a counter-example:
-- that migration also REVOKEs UPDATE/DELETE to make the trail append-only, and
-- the grant sits beside the revoke. Nothing is revoked here — an error report
-- is updated on every repeat (`occurrences`, `last_seen_at`, `resolved_at`),
-- which is the entire grouping design.
