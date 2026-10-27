-- ═══════════════════════════════════════════════════════════════════════════
-- «استوديو البوستات» — draft social posts made from platform events, and the
-- Facebook Page / Instagram account they publish to.
--
-- `social_posts.source_key` is UNIQUE: the scan inserts with ON CONFLICT DO
-- NOTHING semantics, so one event is one row however often it is seen, and a
-- skipped row keeps its key so the event is never drafted again.
--
-- `social_settings` is a singleton holding the Page token ENCRYPTED. It is its
-- own table, not a key in `site_settings`, because that blob is returned whole
-- to the settings form and written whole into the audit log.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."social_posts" (
  "id"                  UUID NOT NULL,
  "source_key"          TEXT NOT NULL,
  "kind"                TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'draft',
  "facts"               JSONB NOT NULL,
  "caption"             TEXT NOT NULL,
  "link"                TEXT NOT NULL,
  "format"              TEXT NOT NULL DEFAULT 'square',
  "image_key"           TEXT,
  "image_format"        TEXT,
  "scheduled_at"        TIMESTAMPTZ(3),
  "published_at"        TIMESTAMPTZ(3),
  "publish_mode"        TEXT,
  "facebook_post_id"    TEXT,
  "facebook_permalink"  TEXT,
  "instagram_media_id"  TEXT,
  "instagram_permalink" TEXT,
  "last_error"          TEXT,
  "attempts"            INTEGER NOT NULL DEFAULT 0,
  "locked_at"           TIMESTAMPTZ(3),
  "updated_by"          TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_posts_kind_check"
    CHECK ("kind" IN ('honor', 'results', 'certificates', 'course', 'lecture', 'news')),
  CONSTRAINT "social_posts_status_check"
    CHECK ("status" IN ('draft', 'scheduled', 'published', 'skipped')),
  CONSTRAINT "social_posts_format_check" CHECK ("format" IN ('square', 'story')),
  CONSTRAINT "social_posts_image_format_check"
    CHECK ("image_format" IS NULL OR "image_format" IN ('square', 'story')),
  CONSTRAINT "social_posts_publish_mode_check"
    CHECK ("publish_mode" IS NULL OR "publish_mode" IN ('api', 'manual')),
  -- The shape the storage layer accepts, restated where a direct SQL write
  -- cannot get around it.
  CONSTRAINT "social_posts_image_key_check"
    CHECK ("image_key" IS NULL OR "image_key" ~ '^sp/[0-9a-f-]{36}\.jpg$'),
  -- A scheduled post has a time; that is what puts it on the calendar.
  CONSTRAINT "social_posts_scheduled_has_time_check"
    CHECK ("status" <> 'scheduled' OR "scheduled_at" IS NOT NULL),
  CONSTRAINT "social_posts_caption_check" CHECK (length("caption") BETWEEN 1 AND 2200)
);

CREATE UNIQUE INDEX "social_posts_source_key_key" ON "app"."social_posts"("source_key");
CREATE UNIQUE INDEX "social_posts_image_key_key" ON "app"."social_posts"("image_key");
CREATE INDEX "social_posts_status_created_at_idx" ON "app"."social_posts"("status", "created_at");
CREATE INDEX "social_posts_status_scheduled_at_idx" ON "app"."social_posts"("status", "scheduled_at");

CREATE TABLE "app"."social_settings" (
  "id"                INTEGER NOT NULL DEFAULT 1,
  "page_id"           TEXT,
  "instagram_user_id" TEXT,
  "token_ciphertext"  TEXT,
  "token_hint"        TEXT,
  "hashtags"          TEXT NOT NULL DEFAULT '',
  "last_scan_at"      TIMESTAMPTZ(3),
  "updated_by"        TEXT,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_settings_singleton" CHECK ("id" = 1)
);
