-- «محفوظة» — an uploaded lecture taken off its lesson but kept, so it can be
-- put back later instead of re-uploaded. The files never moved; this row is
-- what a lesson needs to play them again.
--
-- A new table, nothing else touched: every stack keeps behaving exactly as it
-- did until someone chooses «احتفظ بيه».
CREATE TABLE "app"."archived_videos" (
  "external_id"       TEXT         NOT NULL,
  "source_name"       TEXT,
  "duration_seconds"  INTEGER      NOT NULL,
  "mirror_height"     INTEGER,
  "mirror_bytes"      BIGINT,
  "poster_key"        TEXT,
  "from_lesson_title" TEXT,
  "from_course_title" TEXT,
  "archived_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archived_videos_pkey" PRIMARY KEY ("external_id"),
  -- Only our own uploads are ever kept: 32 lowercase hex, the same shape
  -- `lesson_videos_external_id_shape` enforces for provider 'upload'.
  CONSTRAINT "archived_videos_upload_id_shape" CHECK ("external_id" ~ '^[0-9a-f]{32}$')
);
