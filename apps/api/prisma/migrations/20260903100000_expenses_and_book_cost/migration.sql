-- ═══════════════════════════════════════════════════════════════════════════
-- المصروفات — the other half of the ledger.
--
-- `/admin/finance` could say what came IN (subscription revenue, book-order
-- revenue) and nothing at all about what went out, so the one number Ayman
-- actually runs the business on — «صرفت كام ودخلي كام» — could not be
-- computed anywhere on the platform. «التصوير استوديو… دفعت للمطبعة… جبت
-- حاجات زيادة زي قلم، تابلت.»
--
-- ## Why a table and not columns on something existing
--
-- An expense has no other home. It is not a property of a course, a book or a
-- student — a studio day belongs to a MONTH, which is the axis every question
-- here is asked along ("what did I spend in October"). `occurred_on` is that
-- axis and it is a DATE, not a timestamp: nobody records the minute they paid
-- the printer, and a timestamp would invite a timezone bug into a figure
-- that is only ever bucketed by month.
--
-- ## `occurred_on` is separate from `created_at`
--
-- WHEN THE MONEY LEFT versus when somebody typed it in. Entering last month's
-- studio invoice today must land in last month's total, or every month closes
-- wrong the moment data entry lags by a day. `created_at` survives for the
-- audit trail.
--
-- ## `book_id` + `quantity`, both nullable
--
-- «أنا برضه بدفع للمطبعة … اشتريت عشر كتب بكذا» — a print run is an expense
-- whose whole meaning is which title it bought and how many copies. Linking it
-- lets the book's page answer "what did this title cost me" without a second
-- table that would then have to be kept in step with this one. Both stay
-- NULLABLE because most expenses (a tablet, a studio day) have no book, and
-- `expenses_book_needs_quantity` refuses the half-stated version: a row naming
-- a book with no count cannot say what it bought.
--
-- ON DELETE SET NULL: retiring a title from the catalogue must not silently
-- delete money that was really spent. The row survives with its amount and its
-- month intact and merely stops naming a book.
--
-- ## `amount_cents` is a positive integer
--
-- Piastres, like every other money column here, and CHECKed above zero: an
-- expense of zero is a row nobody meant to write, and a NEGATIVE one is a
-- refund — a real thing, and one that must be modelled as its own kind rather
-- than smuggled in as a minus sign that silently flips every SUM on the page.
--
-- ## Why `unit_cost_cents` also lands on `books`
--
-- The expense table answers "what did I spend". It cannot answer "what do I
-- make on each copy I sell", because a print run of 500 does not tell you the
-- cost of the one copy that just shipped. That is a per-title figure, it
-- belongs beside `price_cents`, and it is NULLABLE — «مش معروف» is the honest
-- state for every title that existed before this column, and the margin is
-- simply not shown for those rather than being computed against a zero that
-- would report the full price as profit.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."expense_category" AS ENUM (
  -- التصوير والاستوديو
  'filming',
  -- المطبعة — printing the books
  'printing',
  -- أدوات ومعدات: قلم، تابلت، لابتوب
  'equipment',
  -- إعلانات
  'marketing',
  -- أجور ومساعدين
  'staff',
  -- اشتراكات وخدمات (سيرفرات، برامج)
  'services',
  -- أي حاجة تانية
  'other'
);

CREATE TABLE "app"."expenses" (
  "id"           UUID PRIMARY KEY,
  "occurred_on"  DATE NOT NULL,
  "category"     "app"."expense_category" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  -- What it was, in the admin's own words. Required: an unlabelled number in a
  -- ledger is one nobody can audit six months later.
  "title_ar"     VARCHAR(160) NOT NULL,
  "note_ar"      TEXT,
  "book_id"      UUID,
  "quantity"     INTEGER,
  -- Who entered it. `SET NULL` on delete, same as every other actor reference
  -- here: removing a staff account must not erase the books.
  "created_by"   TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "expenses_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "expenses_quantity_positive" CHECK ("quantity" IS NULL OR "quantity" > 0),
  CONSTRAINT "expenses_book_needs_quantity"
    CHECK ("book_id" IS NULL OR "quantity" IS NOT NULL),
  CONSTRAINT "expenses_title_not_blank" CHECK (btrim("title_ar") <> ''),

  CONSTRAINT "expenses_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "app"."books"("id") ON DELETE SET NULL,
  CONSTRAINT "expenses_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL
);

-- The one axis every question is asked along. `category` second so
-- "October, printing" is the same index.
CREATE INDEX "expenses_occurred_on_idx" ON "app"."expenses" ("occurred_on" DESC, "category");
CREATE INDEX "expenses_book_id_idx" ON "app"."expenses" ("book_id") WHERE "book_id" IS NOT NULL;

ALTER TABLE "app"."books"
  ADD COLUMN "unit_cost_cents" INTEGER;

ALTER TABLE "app"."books"
  ADD CONSTRAINT "books_unit_cost_not_negative"
  CHECK ("unit_cost_cents" IS NULL OR "unit_cost_cents" >= 0);
