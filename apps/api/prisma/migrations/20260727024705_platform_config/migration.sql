-- NOTE (STANDING HAZARD H1): Prisma's diff engine generated a spurious
-- `DROP CONSTRAINT "lessons_section_matches_course"` here, as it does on every
-- `migrate dev` run — that composite FK cannot be expressed in schema.prisma
-- so Prisma always sees it as drift. Stripped by hand; DO NOT reintroduce it.
-- Verify with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- CreateEnum
CREATE TYPE "home_block_type" AS ENUM ('hero', 'courseGrid', 'stats', 'testimonials', 'faq', 'cta');

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "description_ar" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout" JSONB,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "navigation_items" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "label_ar" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "icon" TEXT,
    "position" INTEGER NOT NULL,
    "visible_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_blocks" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "home_block_type" NOT NULL,
    "props" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_ar" TEXT,
    "uploaded_by" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT,
    "actor_ip" INET,
    "actor_user_agent" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB,
    "request_id" TEXT,
    "prev_hash" CHAR(64),
    "hash" CHAR(64) NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "navigation_items_parent_id_position_idx" ON "navigation_items"("parent_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "home_blocks_key_key" ON "home_blocks"("key");

-- CreateIndex
CREATE INDEX "home_blocks_position_idx" ON "home_blocks"("position");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_created_at_idx" ON "media_assets"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_occurred_at_idx" ON "audit_log"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_idx" ON "audit_log"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "navigation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── A5: the singleton is enforced by the DATABASE, not the UI ─────────────
ALTER TABLE "site_settings"
  ADD CONSTRAINT "site_settings_singleton" CHECK ("id" = 1);

-- Seed the one row so every read is a plain findUnique and never a
-- "create it if it's missing" race between two concurrent admins.
INSERT INTO "site_settings" ("id", "data", "updated_at")
VALUES (1, '{}'::jsonb, now())
ON CONFLICT ("id") DO NOTHING;

-- ── A7: audit_log is INSERT-only for the runtime role ─────────────────────
-- The table already inherited SELECT/INSERT/UPDATE/DELETE from the
-- ALTER DEFAULT PRIVILEGES set up in scripts/db-bootstrap.sql, so an explicit
-- REVOKE is required — omitting it leaves the trail erasable. TRUNCATE is
-- owner-only in Postgres and cannot be granted through default privileges, but
-- naming it here documents the intent and is a no-op if it was never held.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM "ayman_runtime";

-- The sequence is still needed for the bigserial id.
GRANT USAGE, SELECT ON SEQUENCE "audit_log_id_seq" TO "ayman_runtime";
