-- ═══════════════════════════════════════════════════════════════════════════
-- «المونتاج» — finished videos the video editor hands over.
--
-- The bytes live in the video bucket under `montage/<storage_id>/source`,
-- exactly as uploaded; these rows are the only index of them. Putting one on
-- a lesson COPIES the file into that lesson's own upload slot, so the encode
-- deleting its copy never touches the hand-over.
--
-- `published_lesson_id` has no foreign key on purpose: deleting a lesson must
-- not delete or block the hand-over it was made from.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."montage_videos" (
  "id"                  UUID NOT NULL,
  "title"               TEXT NOT NULL,
  "note"                TEXT,
  "file_name"           TEXT NOT NULL,
  "storage_id"          TEXT NOT NULL,
  "upload_id"           TEXT,
  "size_bytes"          BIGINT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'uploading',
  "uploaded_by"         TEXT,
  "published_lesson_id" UUID,
  "published_at"        TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "montage_videos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "montage_videos_status_check" CHECK ("status" IN ('uploading', 'ready')),
  CONSTRAINT "montage_videos_title_check" CHECK (length("title") BETWEEN 1 AND 200),
  -- The shape `montageSourceKey` accepts, restated where a direct SQL write
  -- cannot get around it.
  CONSTRAINT "montage_videos_storage_id_check" CHECK ("storage_id" ~ '^[0-9a-f]{32}$'),
  CONSTRAINT "montage_videos_size_check" CHECK ("size_bytes" > 0)
);

CREATE UNIQUE INDEX "montage_videos_storage_id_key" ON "app"."montage_videos"("storage_id");
CREATE INDEX "montage_videos_created_at_idx" ON "app"."montage_videos"("created_at");
