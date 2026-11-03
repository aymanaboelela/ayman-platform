-- ═══════════════════════════════════════════════════════════════════════════
-- «احفظهم في واتساب» — students saved as WhatsApp-only contacts on the linked
-- number, so the instructor's Status reaches the ones who saved him.
--
-- `whatsapp_contact_saves` is the memory: one row per E.164 number, so a
-- second run never writes anybody twice. `whatsapp_contact_sync` is the one
-- run (a singleton — there is one linked number), and it keeps the pacing
-- counters across runs so pressing «ابدأ» again cannot buy a fresh daily cap.
--
-- Purely additive. No existing table is touched.
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."whatsapp_contact_saves" (
  "phone"      VARCHAR(20) NOT NULL,
  "user_id"    TEXT,
  "name"       TEXT NOT NULL,
  "status"     VARCHAR(16) NOT NULL DEFAULT 'pending',
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "lid"        TEXT,
  "saved_at"   TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_contact_saves_pkey" PRIMARY KEY ("phone"),
  CONSTRAINT "whatsapp_contact_saves_phone_check" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "whatsapp_contact_saves_status_check"
    CHECK ("status" IN ('pending', 'saved', 'not_on_whatsapp', 'failed', 'skipped')),
  CONSTRAINT "whatsapp_contact_saves_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "whatsapp_contact_saves_status_created_at_idx"
  ON "app"."whatsapp_contact_saves"("status", "created_at");

CREATE TABLE "app"."whatsapp_contact_sync" (
  "id"             INTEGER NOT NULL DEFAULT 1,
  "state"          VARCHAR(16) NOT NULL DEFAULT 'idle',
  "pause_code"     VARCHAR(16),
  "last_error"     TEXT,
  "run_limit"      INTEGER,
  "saved_this_run" INTEGER NOT NULL DEFAULT 0,
  "sent_in_batch"  INTEGER NOT NULL DEFAULT 0,
  "saved_today"    INTEGER NOT NULL DEFAULT 0,
  "day_key"        VARCHAR(10),
  "next_at"        TIMESTAMP(3),
  "started_at"     TIMESTAMP(3),
  "started_by"     TEXT,
  "last_saved_at"  TIMESTAMP(3),
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_contact_sync_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_contact_sync_singleton" CHECK ("id" = 1),
  CONSTRAINT "whatsapp_contact_sync_state_check"
    CHECK ("state" IN ('idle', 'running', 'paused', 'done')),
  CONSTRAINT "whatsapp_contact_sync_pause_code_check"
    CHECK ("pause_code" IS NULL OR "pause_code" IN ('manual', 'limit', 'device', 'restricted', 'error')),
  CONSTRAINT "whatsapp_contact_sync_run_limit_check" CHECK ("run_limit" IS NULL OR "run_limit" > 0)
);
