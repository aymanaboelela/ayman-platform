-- The columns and constraints «الرفع المباشر» needs, now that the status enum
-- carries 'uploading' (previous migration — the value cannot be added and used
-- in one transaction).

-- ── external_id may now be an upload id ───────────────────────────────────
--
-- The old constraint was YouTube-or-anything: it pinned the 11-character shape
-- for `provider = 'youtube'` and said nothing at all about the other six
-- providers, because only YouTube was ever written. `upload` is now written
-- too, and its id is the OBJECT KEY students' bytes are served from — an
-- unconstrained column there is a path traversal waiting for the one code path
-- that forgets to validate.
--
-- 32 lowercase hex, deliberately a different shape from a YouTube id so both
-- can share the `v/<id>/` namespace and so one glance at the column says which
-- pipeline produced the row.
ALTER TABLE "app"."lesson_videos" DROP CONSTRAINT IF EXISTS "lesson_videos_youtube_id_only";

ALTER TABLE "app"."lesson_videos"
  ADD CONSTRAINT "lesson_videos_external_id_shape" CHECK (
    CASE "provider"
      WHEN 'youtube' THEN "external_id" ~ '^[A-Za-z0-9_-]{11}$'
      WHEN 'upload' THEN "external_id" ~ '^[0-9a-f]{32}$'
      ELSE TRUE
    END
  );

-- ── 'uploading' belongs to uploads alone ──────────────────────────────────
--
-- A YouTube row in `uploading` would be a row the worker's YouTube branch
-- skips and its upload branch cannot handle — invisible to both queues and
-- dark forever. Cheaper to make it unrepresentable.
ALTER TABLE "app"."lesson_videos"
  ADD CONSTRAINT "lesson_videos_uploading_is_upload" CHECK (
    "mirror_status" <> 'uploading' OR "provider" = 'upload'
  );

-- ── a coarse progress bar ─────────────────────────────────────────────────
--
-- Written by the worker between encoder passes, not read from ffmpeg's own
-- output. A transcode is minutes of silence and an admin watching a spinner
-- assumes it has hung; a bar that moves in four honest steps is worth more
-- than a smooth one interpolated from nothing.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "mirror_progress" INTEGER;

ALTER TABLE "app"."lesson_videos"
  ADD CONSTRAINT "lesson_videos_mirror_progress_range" CHECK (
    "mirror_progress" IS NULL OR ("mirror_progress" >= 0 AND "mirror_progress" <= 100)
  );

-- The original file, while it waits to be packaged. Sized so the admin screen
-- can say what an upload cost before the ladder replaces it, and so an
-- abandoned session is visible as bytes rather than inferred from a status.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "source_bytes" BIGINT;

-- The name the instructor's own file had. Shown back to them while it uploads
-- and in the admin table afterwards; NEVER part of an object key.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "source_name" TEXT;

-- ── the worker's claim query, for uploads ─────────────────────────────────
--
-- Same shape as `lesson_videos_mirror_idx` and for the same reason: `ready` is
-- the steady state of nearly every row, so the index that finds the handful
-- that are not must not be an index of the whole table. Provider is in the key
-- because the two pipelines claim from disjoint sets and scanning one to find
-- the other is the query this table would otherwise get wrong at scale.
CREATE INDEX IF NOT EXISTS "lesson_videos_mirror_provider_idx"
  ON "app"."lesson_videos" ("provider", "mirror_status", "mirror_at");
