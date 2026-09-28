-- «قص الفيديو» — start, end and parts cut out of an uploaded lecture, applied
-- by the player. The files are never re-encoded, so every cut can be undone.
--
-- Additive and nullable: every existing lecture plays exactly as before.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "trim_start_seconds"    INTEGER,
  ADD COLUMN "trim_end_seconds"      INTEGER,
  ADD COLUMN "trim_cuts"             JSONB,
  ADD COLUMN "full_duration_seconds" INTEGER,
  ADD CONSTRAINT "lesson_videos_trim_range" CHECK (
    ("trim_start_seconds" IS NULL OR "trim_start_seconds" >= 0)
    AND ("trim_end_seconds" IS NULL OR "trim_end_seconds" > COALESCE("trim_start_seconds", 0))
  );
