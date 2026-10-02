-- «أسئلة كتب خارجية» — نفس فكرة «أسئلة الألعاب» (20260928190000_game_question_banks)
-- بالظبط: عمود nullable UNIQUE على التصنيف، مش جدول علاقة جديد. الكتاب نفسه
-- جدول صغير (اسم وغلاف)؛ الوحدات والدروس جوّاه مجرد تصنيفات عادية تحت تصنيف
-- جذر الكتاب (parentId)، فمفيش عمود جديد لهم.
CREATE TABLE "app"."external_books" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "cover_key" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_books_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."question_categories"
  ADD COLUMN "external_book_id" UUID;

-- UNIQUE: تصنيف جذر واحد بس لكل كتاب. NULL مش بيتعدّ في UNIQUE في Postgres،
-- فكل التصنيفات العادية (ومنها تصنيفات الألعاب) بتفضل زي ما هي.
CREATE UNIQUE INDEX "question_categories_external_book_id_key"
  ON "app"."question_categories" ("external_book_id");

-- `SetNull`: كتاب اتمسح (أو بالأحرى اتأرشف — مفيش DELETE من الشاشة)، أسئلته
-- تفضل في البنك كتصنيف عادي.
ALTER TABLE "app"."question_categories"
  ADD CONSTRAINT "question_categories_external_book_id_fkey"
  FOREIGN KEY ("external_book_id") REFERENCES "app"."external_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
