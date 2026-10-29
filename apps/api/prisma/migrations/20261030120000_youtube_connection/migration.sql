-- ═══════════════════════════════════════════════════════════════════════════
-- «يوتيوب» — the teacher's YouTube channel, connected once through Google
-- OAuth, so video titles, descriptions, tags and thumbnails can be edited
-- from the admin.
--
-- A singleton holding the REFRESH token ENCRYPTED (AES-256-GCM, key derived
-- from BETTER_AUTH_SECRET — `token-cipher.ts`). Its own table for the reason
-- `social_settings` gives: `site_settings` goes whole to a settings form and
-- whole into the audit log on every save.
--
-- `pending_state_*` holds the one OAuth round-trip in flight (the SHA-256 of
-- its nonce, never the nonce), consumed by a conditional UPDATE so a state is
-- accepted exactly once.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."youtube_connection" (
  "id"                       INTEGER NOT NULL DEFAULT 1,
  "channel_id"               TEXT,
  "channel_title"            TEXT,
  "channel_avatar_url"       TEXT,
  "channel_custom_url"       TEXT,
  "uploads_playlist_id"      TEXT,
  "token_ciphertext"         TEXT,
  "token_hint"               TEXT,
  "connected_by"             TEXT,
  "connected_at"             TIMESTAMPTZ(3),
  "pending_state_hash"       TEXT,
  "pending_state_user_id"    TEXT,
  "pending_state_expires_at" TIMESTAMPTZ(3),
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "youtube_connection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "youtube_connection_singleton" CHECK ("id" = 1),
  -- A connection is the token AND the channel it reaches, or neither.
  CONSTRAINT "youtube_connection_token_has_channel_check"
    CHECK (("token_ciphertext" IS NULL) = ("channel_id" IS NULL))
);

-- ── Uploads the platform has seen ───────────────────────────────────────────
-- The first sighting of a channel is a baseline (`is_new = false`), so
-- connecting a channel with 300 videos does not announce 300 «new» ones.
CREATE TABLE "app"."youtube_videos" (
  "video_id"         TEXT NOT NULL,
  "channel_id"       TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "thumbnail_url"    TEXT,
  "published_at"     TIMESTAMPTZ(3),
  "is_new"           BOOLEAN NOT NULL DEFAULT false,
  "first_seen_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "handled_at"       TIMESTAMPTZ(3),
  "thumbnail_set_at" TIMESTAMPTZ(3),
  CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("video_id"),
  CONSTRAINT "youtube_videos_video_id_check" CHECK ("video_id" ~ '^[A-Za-z0-9_-]{11}$')
);
CREATE INDEX "youtube_videos_channel_id_is_new_handled_at_idx"
  ON "app"."youtube_videos"("channel_id", "is_new", "handled_at");

-- «نزل فيديو جديد» — to the admin who connected the channel.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'youtube_new_video';
