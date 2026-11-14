-- ═══════════════════════════════════════════════════════════════════════════
-- «متابعة التنزيل» — accounts that opened many distinct lectures in one Cairo
-- day. See `VideoKeyFlag` in schema.prisma and `VideoKeyWatchService`.
--
-- Additive only: one new table. No GRANT: `ALTER DEFAULT PRIVILEGES` in the
-- entrypoint covers new tables.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."video_key_flags" (
  "id"         UUID NOT NULL,
  "user_id"    TEXT NOT NULL,
  "day"        DATE NOT NULL,
  "videos"     INTEGER NOT NULL,
  "video_ids"  TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "video_key_flags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_key_flags_videos" CHECK ("videos" > 0)
);

CREATE UNIQUE INDEX "video_key_flags_user_id_day_key" ON "app"."video_key_flags"("user_id", "day");
CREATE INDEX "video_key_flags_day_idx" ON "app"."video_key_flags"("day" DESC);

ALTER TABLE "app"."video_key_flags"
  ADD CONSTRAINT "video_key_flags_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
