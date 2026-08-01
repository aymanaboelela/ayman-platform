-- Rename, never drop: attachments already uploaded survive, and the foreign
-- key, primary key and index come along for free.
--
-- A table rename does NOT rename the constraints and indexes hanging off it,
-- and Prisma derives their expected names from the table name — so leaving
-- them as `lesson_attachments_*` would make `migrate dev` report drift on
-- every subsequent run. All four are renamed explicitly below.
ALTER TABLE "app"."lesson_attachments" RENAME TO "lesson_resources";

ALTER INDEX "app"."lesson_attachments_pkey" RENAME TO "lesson_resources_pkey";
ALTER INDEX "app"."lesson_attachments_lesson_id_position_idx"
  RENAME TO "lesson_resources_lesson_id_position_idx";
ALTER TABLE "app"."lesson_resources"
  RENAME CONSTRAINT "lesson_attachments_lesson_id_fkey" TO "lesson_resources_lesson_id_fkey";

CREATE TYPE "app"."lesson_resource_kind" AS ENUM ('presentation', 'video', 'document', 'link');

-- Nullable first, backfilled, then tightened. Every existing row is an
-- uploaded file with no title of its own, so its filename becomes its title.
-- That is a ONE-TIME backfill, not a fallback the application keeps: `title`
-- is NOT NULL from here on and the service always supplies it.
ALTER TABLE "app"."lesson_resources"
  ADD COLUMN "kind"              "app"."lesson_resource_kind",
  ADD COLUMN "title"             TEXT,
  ADD COLUMN "description"       TEXT,
  ADD COLUMN "video_provider"    "VideoProvider",
  ADD COLUMN "video_external_id" TEXT,
  ADD COLUMN "link_url"          TEXT,
  ADD COLUMN "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "app"."lesson_resources" SET "kind" = 'document', "title" = "filename";

ALTER TABLE "app"."lesson_resources"
  ALTER COLUMN "kind"        SET NOT NULL,
  ALTER COLUMN "title"       SET NOT NULL,
  ALTER COLUMN "storage_key" DROP NOT NULL,
  ALTER COLUMN "filename"    DROP NOT NULL,
  ALTER COLUMN "mime"        DROP NOT NULL,
  ALTER COLUMN "size_bytes"  DROP NOT NULL;

-- `updated_at` is maintained by Prisma's @updatedAt on every application write
-- and by buildReorderSql on a drag. The DEFAULT exists only so the ADD COLUMN
-- above could be NOT NULL against existing rows.
ALTER TABLE "app"."lesson_resources" ALTER COLUMN "updated_at" DROP DEFAULT;

-- One CHECK covering every kind. Each branch names both which payload columns
-- must be PRESENT and that the others are ABSENT, so a row cannot carry a file
-- and a link at once by claiming to be a document.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_payload_matches_kind" CHECK (
    CASE "kind"
      WHEN 'presentation' THEN
        "storage_key" IS NOT NULL AND "filename" IS NOT NULL
        AND "mime" IS NOT NULL AND "size_bytes" IS NOT NULL
        AND "video_external_id" IS NULL AND "video_provider" IS NULL
        AND "link_url" IS NULL
      WHEN 'document' THEN
        "storage_key" IS NOT NULL AND "filename" IS NOT NULL
        AND "mime" IS NOT NULL AND "size_bytes" IS NOT NULL
        AND "video_external_id" IS NULL AND "video_provider" IS NULL
        AND "link_url" IS NULL
      WHEN 'video' THEN
        "video_provider" IS NOT NULL AND "video_external_id" IS NOT NULL
        AND "storage_key" IS NULL AND "filename" IS NULL
        AND "mime" IS NULL AND "size_bytes" IS NULL
        AND "link_url" IS NULL
      WHEN 'link' THEN
        "link_url" IS NOT NULL
        AND "storage_key" IS NULL AND "filename" IS NULL
        AND "mime" IS NULL AND "size_bytes" IS NULL
        AND "video_external_id" IS NULL AND "video_provider" IS NULL
    END
  );

-- The 11-character rule, at the database, mirroring lesson_videos'
-- lesson_videos_external_id_len CHECK. The application extractor is the first
-- line; this is what holds when someone writes SQL directly.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_video_id_is_11_chars" CHECK (
    "video_external_id" IS NULL OR "video_external_id" ~ '^[A-Za-z0-9_-]{11}$'
  );

-- https only. The DTO rejects http:, javascript: and data: first; this is the
-- half that survives a direct write.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_link_is_https" CHECK (
    "link_url" IS NULL OR "link_url" LIKE 'https://%'
  );

-- "The main presentation" is only meaningful if there is at most one of them.
CREATE UNIQUE INDEX "lesson_resources_one_presentation"
  ON "app"."lesson_resources" ("lesson_id") WHERE "kind" = 'presentation';
