-- ═══════════════════════════════════════════════════════════════════════════
-- «ستوديو التصميم» — the graphic designer's folders and pictures.
--
-- The bytes live under the private `design/` storage prefix (a master at full
-- resolution plus a WebP grid preview); these rows are the only index of them.
-- A picture becomes a site image only when the instructor PUBLISHES it, which
-- writes a separate `media_assets` row — so deleting a design never breaks a
-- lecture cover that was made from it.
--
-- `design_assets.folder_id` is RESTRICT: deleting a folder must remove every
-- picture's bytes first, and a cascade would drop the rows that locate them.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."design_folders" (
  "id"         UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "color"      TEXT NOT NULL DEFAULT 'amber',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "design_folders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "design_folders_color_check"
    CHECK ("color" IN ('amber', 'teal', 'violet', 'rose', 'blue', 'green')),
  CONSTRAINT "design_folders_name_check" CHECK (length("name") BETWEEN 1 AND 120)
);

CREATE INDEX "design_folders_created_at_idx" ON "app"."design_folders"("created_at");

CREATE TABLE "app"."design_assets" (
  "id"          UUID NOT NULL,
  "folder_id"   UUID NOT NULL,
  "name"        TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "preview_key" TEXT NOT NULL,
  "format"      TEXT NOT NULL,
  "width"       INTEGER NOT NULL,
  "height"      INTEGER NOT NULL,
  "size_bytes"  INTEGER NOT NULL,
  "version"     INTEGER NOT NULL DEFAULT 1,
  "uploaded_by" TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "design_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "design_assets_format_check" CHECK ("format" IN ('png', 'jpg')),
  CONSTRAINT "design_assets_name_check" CHECK (length("name") BETWEEN 1 AND 120),
  -- The shape the storage layer accepts, restated where a direct SQL write
  -- cannot get around it.
  CONSTRAINT "design_assets_storage_key_check"
    CHECK ("storage_key" ~ '^design/[0-9a-f]{2}/[0-9a-f-]{36}\.(png|jpg)$'),
  CONSTRAINT "design_assets_preview_key_check"
    CHECK ("preview_key" ~ '^design/[0-9a-f]{2}/[0-9a-f-]{36}\.webp$'),
  CONSTRAINT "design_assets_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "size_bytes" > 0)
);

CREATE UNIQUE INDEX "design_assets_storage_key_key" ON "app"."design_assets"("storage_key");
CREATE UNIQUE INDEX "design_assets_preview_key_key" ON "app"."design_assets"("preview_key");
CREATE INDEX "design_assets_folder_id_created_at_idx" ON "app"."design_assets"("folder_id", "created_at");

ALTER TABLE "app"."design_assets"
  ADD CONSTRAINT "design_assets_folder_id_fkey"
  FOREIGN KEY ("folder_id") REFERENCES "app"."design_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
