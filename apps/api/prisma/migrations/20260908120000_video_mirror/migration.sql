-- ═══════════════════════════════════════════════════════════════════════════
-- «النسخة اللي عندنا» — a copy of every lecture on our own origin.
--
-- Students on the ministry tablet cannot watch anything. The tablet's filter
-- blocks YouTube outright, and the player's fallback chain — nocookie, then
-- youtube.com, then a link to the video — is three attempts at ONE host
-- family. A network that drops the family drops all three, which is exactly
-- what the students were reporting: a dead frame, then «افتحه من يوتيوب»,
-- then a tab that loads forever.
--
-- No client-side change can fix that. The bytes have to come from an origin
-- the tablet already allows, and the platform itself is one — those same
-- students are logged in and reading the page the dead player sits on.
--
-- So each video is copied to our object storage as an HLS ladder and the
-- player prefers it, with YouTube demoted to the fallback. The copy is made
-- from YouTube's OWN H.264 renditions, remuxed and never re-encoded: the
-- quality is bit-for-bit what YouTube serves at the same resolution, and
-- packaging an hour costs seconds of CPU rather than an hour of it.
--
-- These columns are the pipeline's state. They are deliberately ON
-- `lesson_videos` rather than in a jobs table: there is exactly one mirror per
-- video, its lifetime is the video's lifetime, and the ON DELETE CASCADE that
-- already cleans up a deleted lesson's video should clean up its mirror
-- bookkeeping in the same statement.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."VideoMirrorStatus" AS ENUM (
  'pending',
  'mirroring',
  'ready',
  'failed',
  'disabled'
);

-- `pending` for every existing row, and that is the entire backfill. A video
-- already on the platform is exactly as blocked on a ministry tablet as one
-- added tomorrow, so there is no population to exclude and no default of
-- 'disabled' to walk back later.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "mirror_status"   "app"."VideoMirrorStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "mirror_height"   INTEGER,
  ADD COLUMN "mirror_bytes"    BIGINT,
  ADD COLUMN "mirror_error"    TEXT,
  ADD COLUMN "mirror_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mirror_at"       TIMESTAMP(3);

-- A ready mirror asserts a height; a mirror that is not ready must not claim
-- one. Without this the player could be handed `maxHeight` for a copy whose
-- segments are half-uploaded, and «جودة عالية» would be a lie told by a row
-- rather than by code anybody could review.
ALTER TABLE "app"."lesson_videos"
  ADD CONSTRAINT "lesson_videos_mirror_height_ck"
  CHECK (("mirror_status" = 'ready') = ("mirror_height" IS NOT NULL));

-- The worker's claim query is (status, age) and nothing else.
--
-- Deliberately NOT a partial index excluding 'ready', which is what the shape
-- of the query invites: Prisma cannot express a partial index, so writing one
-- here would put the database permanently out of step with `schema.prisma`
-- and every future `migrate diff` would report drift that is not drift. The
-- table is one row per lecture — a few hundred — so the full index costs
-- nothing worth that.
CREATE INDEX "lesson_videos_mirror_idx"
  ON "app"."lesson_videos" ("mirror_status", "mirror_at");
