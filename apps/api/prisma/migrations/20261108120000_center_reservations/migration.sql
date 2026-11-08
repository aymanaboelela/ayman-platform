-- ═══════════════════════════════════════════════════════════════════════════
-- «حجز السناتر» — a public page where a student picks a centre (or the online
-- platform), fills a short form, picks a weekly group (`center_slots`), and
-- pays a share of one session («نص الحصة») with a transfer screenshot.
--
-- Additive only: three new tables, four nullable/defaulted columns on
-- `centers`. Nothing existing changes meaning — `reservations_open` defaults
-- to false, so no centre appears on the page until someone opens it, and the
-- settings row defaults to closed.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES for new
-- tables in `app`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."centers"
  ADD COLUMN "reservations_open" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "instapay"          TEXT,
  ADD COLUMN "vodafone_cash"     TEXT;

CREATE TYPE "app"."center_reservation_status" AS ENUM ('started', 'submitted', 'confirmed', 'rejected', 'cancelled');

-- Reservation numbers start at 1001 so the first one read over the phone does
-- not sound like a test row.
CREATE SEQUENCE "app"."center_reservations_number_seq" START WITH 1001;

CREATE TABLE "app"."center_reservations" (
  "id"                  UUID NOT NULL,
  "number"              INTEGER NOT NULL DEFAULT nextval('app.center_reservations_number_seq'),
  "center_id"           UUID NOT NULL,
  "slot_id"             UUID,
  "full_name"           TEXT NOT NULL,
  "phone"               TEXT NOT NULL,
  "grade_slug"          TEXT NOT NULL,
  "track"               TEXT,
  "system"              TEXT,
  "gender"              TEXT,
  "status"              "app"."center_reservation_status" NOT NULL DEFAULT 'started',
  "session_price_cents" INTEGER,
  "amount_cents"        INTEGER NOT NULL DEFAULT 0,
  "payment_method"      TEXT,
  "sender_phone"        TEXT,
  "screenshot_key"      TEXT,
  "submitted_at"        TIMESTAMP(3),
  "reviewed_at"         TIMESTAMP(3),
  "reviewed_by_user_id" TEXT,
  "rejection_reason"    TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "center_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "center_reservations_name_not_blank" CHECK (length(btrim("full_name")) > 0),
  CONSTRAINT "center_reservations_amount" CHECK ("amount_cents" >= 0),
  CONSTRAINT "center_reservations_price" CHECK ("session_price_cents" IS NULL OR "session_price_cents" >= 0),
  CONSTRAINT "center_reservations_track" CHECK ("track" IS NULL OR "track" IN ('arabic', 'languages')),
  CONSTRAINT "center_reservations_system" CHECK ("system" IS NULL OR "system" IN ('general', 'azhar')),
  CONSTRAINT "center_reservations_gender" CHECK ("gender" IS NULL OR "gender" IN ('male', 'female')),
  CONSTRAINT "center_reservations_method" CHECK ("payment_method" IS NULL OR "payment_method" IN ('instapay', 'vodafoneCash'))
);
ALTER SEQUENCE "app"."center_reservations_number_seq" OWNED BY "app"."center_reservations"."number";

CREATE UNIQUE INDEX "center_reservations_number_key" ON "app"."center_reservations"("number");
CREATE INDEX "center_reservations_center_id_status_created_at_idx" ON "app"."center_reservations"("center_id", "status", "created_at");
CREATE INDEX "center_reservations_phone_idx" ON "app"."center_reservations"("phone");
CREATE INDEX "center_reservations_slot_id_status_idx" ON "app"."center_reservations"("slot_id", "status");

ALTER TABLE "app"."center_reservations" ADD CONSTRAINT "center_reservations_center_id_fkey"
  FOREIGN KEY ("center_id") REFERENCES "app"."centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."center_reservations" ADD CONSTRAINT "center_reservations_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "app"."center_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."center_managers" (
  "user_id"    TEXT NOT NULL,
  "center_id"  UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "center_managers_pkey" PRIMARY KEY ("user_id")
);
CREATE INDEX "center_managers_center_id_idx" ON "app"."center_managers"("center_id");
ALTER TABLE "app"."center_managers" ADD CONSTRAINT "center_managers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."center_managers" ADD CONSTRAINT "center_managers_center_id_fkey"
  FOREIGN KEY ("center_id") REFERENCES "app"."centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."center_reservation_settings" (
  "id"         INTEGER NOT NULL DEFAULT 1,
  "is_open"    BOOLEAN NOT NULL DEFAULT false,
  "headline"   TEXT,
  "note"       TEXT,
  "grades"     TEXT[] DEFAULT ARRAY['bac1', 'bac2']::TEXT[],
  "ask_track"  BOOLEAN NOT NULL DEFAULT true,
  "ask_system" BOOLEAN NOT NULL DEFAULT true,
  "ask_gender" BOOLEAN NOT NULL DEFAULT true,
  "pay_percent" INTEGER NOT NULL DEFAULT 50,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "center_reservation_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "center_reservation_settings_singleton" CHECK ("id" = 1),
  CONSTRAINT "center_reservation_settings_pay_percent" CHECK ("pay_percent" BETWEEN 0 AND 100)
);
