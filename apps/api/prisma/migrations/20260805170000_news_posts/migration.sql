-- «نيوز» — the public articles section.
--
-- Hand-written, like every migration since 20260802: `prisma migrate dev`
-- cannot be used on this schema. The database carries constraints Prisma has
-- no syntax for — the DEFERRABLE unique on course_sections, the composite
-- (section_id, course_id) foreign key on lessons, the CHECK constraints on
-- conversations — so migrate reads all of them as drift and offers to reset
-- the database. Authoring the SQL is the only safe path here.

CREATE TYPE "app"."news_status" AS ENUM ('draft', 'published');

-- Evergreen teaching content, not a ministry-news feed. See the model comment
-- in schema.prisma for why that distinction is deliberate.
CREATE TABLE "app"."news_posts" (
    "id" UUID NOT NULL,
    -- CITEXT so `/news/الحلقات` and `/news/الحلقات` differing only by case can
    -- never become two rows serving two URLs with the same content.
    "slug" CITEXT NOT NULL,
    "title" TEXT NOT NULL,
    -- Doubles as the meta description; see the model comment.
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "app"."news_status" NOT NULL DEFAULT 'draft',
    "cover_key" TEXT,
    "related_course_id" UUID,
    "author_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_posts_slug_key" ON "app"."news_posts"("slug");

-- The public list is "published, newest first" on a cacheable page. DESC in
-- the index so that query never sorts.
CREATE INDEX "news_posts_status_published_at_idx"
    ON "app"."news_posts"("status", "published_at" DESC);

-- RESTRICT: an author with articles cannot be deleted out from under them.
ALTER TABLE "app"."news_posts"
    ADD CONSTRAINT "news_posts_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "app"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL: unpublishing a course must not delete the article driving traffic
-- to it. The article stands, it just loses its call to action.
ALTER TABLE "app"."news_posts"
    ADD CONSTRAINT "news_posts_related_course_id_fkey"
    FOREIGN KEY ("related_course_id") REFERENCES "app"."courses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- A published post must actually have a publication date, or the sitemap and
-- JSON-LD both emit null `datePublished` and the article is treated as undated.
ALTER TABLE "app"."news_posts"
    ADD CONSTRAINT "news_posts_published_has_date"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
