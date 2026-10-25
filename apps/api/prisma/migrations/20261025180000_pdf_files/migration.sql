-- ═══════════════════════════════════════════════════════════════════════════
-- «ملفات PDF» — public downloads, one indexed page each.
--
-- A PDF lives at `/pdfs/:slug`: a page search engines can rank, and the link
-- that goes under a YouTube video. The bytes are a private `doc/…` storage key
-- uploaded through `/api/media/documents`; `GET /api/pdfs/:slug/download`
-- streams them and bumps `download_count`.
--
-- Same draft/published lifecycle and the same date CHECK as `news_posts`: a
-- published row without a date would print an undated page and JSON-LD.
--
-- `news_posts.pdf_id` lets an article carry a «حمّل الـPDF» card. SET NULL:
-- deleting a PDF must not take the article with it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."pdf_files" (
  "id"             UUID NOT NULL,
  "slug"           CITEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "body"           TEXT NOT NULL DEFAULT '',
  "category"       TEXT NOT NULL,
  "year"           SMALLINT,
  "cover_key"      TEXT,
  "file_key"       TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "size_bytes"     INTEGER NOT NULL,
  "page_count"     INTEGER,
  "status"         "app"."news_status" NOT NULL DEFAULT 'draft',
  "published_at"   TIMESTAMP(3),
  "download_count" INTEGER NOT NULL DEFAULT 0,
  "author_id"      TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pdf_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pdf_files_category_check"
    CHECK ("category" IN ('book', 'summary', 'revision', 'exam', 'notes', 'other')),
  CONSTRAINT "pdf_files_year_check" CHECK ("year" IS NULL OR "year" IN (1, 2)),
  CONSTRAINT "pdf_files_published_has_date"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "pdf_files_slug_key" ON "app"."pdf_files"("slug");

CREATE INDEX "pdf_files_status_published_at_idx"
  ON "app"."pdf_files"("status", "published_at" DESC);

ALTER TABLE "app"."pdf_files"
  ADD CONSTRAINT "pdf_files_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."news_posts" ADD COLUMN "pdf_id" UUID;

ALTER TABLE "app"."news_posts"
  ADD CONSTRAINT "news_posts_pdf_id_fkey"
  FOREIGN KEY ("pdf_id") REFERENCES "app"."pdf_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "news_posts_pdf_id_idx" ON "app"."news_posts"("pdf_id");
