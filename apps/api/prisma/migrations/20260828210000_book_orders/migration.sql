-- الكتاب الورقي — an optional printed textbook per course, and the order a
-- student places to have one delivered home. See `Course.bookTitle` and the
-- `BookOrder` model doc in schema.prisma for the full reasoning.

ALTER TABLE "app"."courses"
  ADD COLUMN "book_title" TEXT,
  ADD COLUMN "book_price_cents" INTEGER;

-- A book must have both a title and a price, or neither — same convention as
-- `courses_priced_requires_grant`.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_book_needs_price_and_title"
  CHECK (
    ("book_title" IS NULL AND "book_price_cents" IS NULL)
    OR ("book_title" IS NOT NULL AND "book_price_cents" IS NOT NULL)
  );

CREATE TYPE "app"."book_order_status" AS ENUM ('address_only', 'paid', 'shipped');

CREATE TABLE "app"."book_orders" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "course_id" UUID NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "alt_phone" TEXT NOT NULL,
  "governorate_code" CHAR(2) NOT NULL,
  "address_street" TEXT NOT NULL,
  "address_building" TEXT NOT NULL,
  "address_note" TEXT,
  "sender_phone" TEXT,
  "screenshot_key" TEXT,
  "paid_at" TIMESTAMP(3),
  "status" "app"."book_order_status" NOT NULL DEFAULT 'address_only',
  "shipped_at" TIMESTAMP(3),
  "shipped_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "book_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "book_orders_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "book_orders_shipped_by_user_id_fkey"
    FOREIGN KEY ("shipped_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "book_orders_governorate_code_fkey"
    FOREIGN KEY ("governorate_code") REFERENCES "app"."governorates"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The admin list: paid-not-yet-shipped is the default view of `/admin/books`
-- and the Excel export's own filter.
CREATE INDEX "book_orders_status_created_at_idx"
  ON "app"."book_orders" ("status", "created_at");

-- "Has this student got an order already sitting for this course."
CREATE INDEX "book_orders_user_id_course_id_status_idx"
  ON "app"."book_orders" ("user_id", "course_id", "status");

CREATE INDEX "book_orders_governorate_code_idx"
  ON "app"."book_orders" ("governorate_code");
