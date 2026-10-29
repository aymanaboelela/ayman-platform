-- ═══════════════════════════════════════════════════════════════════════════
-- «البانرات الترويجية» — pictures on top of the student dashboard.
--
-- One flat ordered list per stack, capped at 20 rows by the service, so no
-- index beyond `position`. The public read filters `is_active` and `ends_on`
-- in SQL over those few rows.
--
-- `starts_on`/`ends_on` are Cairo calendar DAYS, both inclusive, either one
-- open. The CHECK refuses a window that could never show; the API refuses it
-- first with a readable message.
--
-- No GRANT: `scripts/db-bootstrap.sql` sets ALTER DEFAULT PRIVILEGES, which
-- covers new tables.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."promo_banners" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "image_key" TEXT NOT NULL,
    "link_url" TEXT,
    "years" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_on" DATE,
    "ends_on" DATE,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_banners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promo_banners_window_check" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on")
);

CREATE INDEX "promo_banners_position_idx" ON "app"."promo_banners"("position");
