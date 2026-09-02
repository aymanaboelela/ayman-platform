-- «الكتب» — a real book shop: a catalogue, a cart, and one shipping fee.
--
-- WHAT PROBLEM THIS SOLVES
--
-- `book_orders` shipped tied to a COURSE: the only thing on sale was
-- `courses.book_title` at `courses.book_price_cents`, one per order. Three
-- things that cannot express were all asked for at once —
--
--   · a book with no course behind it (a revision booklet, a past-papers
--     collection, a second-term volume for a subject not yet recorded),
--   · more than one book in one delivery — «واحد سنة أولى، واحد سنة ٢» is one
--     parcel to one address, not two orders that happen to share a street,
--   · a quantity, so two copies is `quantity = 2` and not two rows.
--
-- None of those is a column. All of them are a catalogue, which is what
-- `books` and `book_order_items` are.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
-- `courses.book_title` / `book_price_cents` stay, and stay authoritative for
-- the course page's own «اطلب الكتاب» button — that flow is live and this
-- migration must not break it. `books.course_id` links a catalogue row back to
-- the course when the two are the same book, UNIQUE so a course can never end
-- up with two entries quoting two prices. The backfill at the bottom creates
-- exactly those rows, which is also how «المواد اللي ليها كتاب في المنصة»
-- appear in the shop on the day it opens rather than after a day of data entry.
--
-- `book_orders.amount_cents` keeps its name and its meaning (what this order is
-- worth). `/admin/finance`'s book-revenue tile, the shipping-desk export and
-- the admin list all read it. What changes is that it is now the SUM of the
-- three new columns, and `book_orders_amount_is_the_sum` makes the two
-- spellings unable to disagree — an admin edit that changes a line and forgets
-- the total is a failed write here rather than an invoice that says one number
-- and a list that says another.
--
-- SHIPPING IS ONE AMOUNT PER ORDER, NOT PER BOOK
--
-- «مش منطقي إن يشتري ٢ ويدفع شحن مرتين» — one courier trip carries the whole
-- basket. So `shipping_cents` sits on `book_orders` and never on
-- `book_order_items`, which makes charging it twice unrepresentable rather than
-- merely discouraged. It is a column and not a constant read at render time so
-- waiving it for one order is an edit, not a deploy, and so raising the fee
-- never rewrites what an old order says it cost. Existing orders are back-filled
-- with `shipping_cents = 0` because they genuinely were never charged it.
--
-- EVERY MONEY COLUMN IS A SNAPSHOT
--
-- `items_cents`, `shipping_cents`, `discount_cents`, `amount_cents` and the
-- per-line `unit_price_cents`/`title_ar` are written when the order is placed
-- and recomputed only when an admin edits THAT order. Nothing recomputes them
-- from `books.price_cents` on read: the price a student was quoted is the price
-- they owe.
--
-- ON DELETE
--
-- `book_order_items.order_id` CASCADE — a line has no meaning without its
-- order. `book_order_items.book_id` SET NULL and `books.subject_id` /
-- `books.course_id` SET NULL — retiring a product, a subject or a course must
-- never rewrite an order that has already shipped, and a null `book_id` is also
-- what lets an admin type a line for something the catalogue does not carry.

CREATE TYPE "app"."book_term" AS ENUM ('first', 'second', 'full');

CREATE TABLE "app"."books" (
    "id" UUID NOT NULL,
    "slug" CITEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "subtitle_ar" TEXT,
    "subject_id" UUID,
    "year" INTEGER,
    "term" "app"."book_term" NOT NULL DEFAULT 'full',
    "course_id" UUID,
    "price_cents" INTEGER NOT NULL,
    "compare_price_cents" INTEGER,
    "cover_key" TEXT,
    "description_ar" TEXT,
    "page_count" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    -- NULL means «مش بنعد», which is the normal case for a title being
    -- reprinted. A DEFAULT 0 here would have hidden every book on day one.
    "stock" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "books_slug_key" ON "app"."books" ("slug");

-- One catalogue entry per course, so the shop and the course page can never
-- quote two different prices for the same physical book.
CREATE UNIQUE INDEX "books_course_id_key" ON "app"."books" ("course_id");

-- The public catalogue reads "active books, by subject then term then order".
CREATE INDEX "books_is_active_subject_id_term_sort_order_idx"
    ON "app"."books" ("is_active", "subject_id", "term", "sort_order");

-- Zero is allowed (a giveaway); negative is not.
ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_price_non_negative" CHECK ("price_cents" >= 0);

-- A "before" price at or below the current one renders a discount that is a lie.
ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_compare_price_above_price"
    CHECK ("compare_price_cents" IS NULL OR "compare_price_cents" > "price_cents");

ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_stock_non_negative" CHECK ("stock" IS NULL OR "stock" >= 0);

ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_page_count_positive"
    CHECK ("page_count" IS NULL OR "page_count" > 0);

-- The card renders «الصف الأول/الثاني/الثالث» from this; a 0 or a 7 has no label.
ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_year_in_range"
    CHECK ("year" IS NULL OR ("year" >= 1 AND "year" <= 3));

ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."books"
    ADD CONSTRAINT "books_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."book_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "book_id" UUID,
    -- Snapshots. A renamed or repriced book must not rewrite a placed order.
    "title_ar" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "book_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "book_order_items_order_id_idx" ON "app"."book_order_items" ("order_id");

-- One line per book per order — a second copy is `quantity`, not a second row,
-- or the totals stop matching the card the student agreed to. ⚠️ Postgres
-- treats NULLs as DISTINCT, so this deliberately does NOT constrain the
-- catalogue-less lines an admin types by hand: several «كتاب خاص» rows on one
-- order are legitimate, and there is no book for them to duplicate.
CREATE UNIQUE INDEX "book_order_items_order_id_book_id_key"
    ON "app"."book_order_items" ("order_id", "book_id");

ALTER TABLE "app"."book_order_items"
    ADD CONSTRAINT "book_order_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "app"."book_order_items"
    ADD CONSTRAINT "book_order_items_unit_price_non_negative"
    CHECK ("unit_price_cents" >= 0);

ALTER TABLE "app"."book_order_items"
    ADD CONSTRAINT "book_order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "app"."book_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."book_order_items"
    ADD CONSTRAINT "book_order_items_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "app"."books"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── book_orders: a basket instead of one course's book ──────────────────────

-- A cart holding a first-year book and a second-year book has no single course
-- to name. Existing rows keep theirs — it is real reporting about where the
-- order started, which the shop cannot reconstruct.
ALTER TABLE "app"."book_orders" ALTER COLUMN "course_id" DROP NOT NULL;

ALTER TABLE "app"."book_orders"
    ADD COLUMN "items_cents" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "shipping_cents" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "discount_cents" INTEGER NOT NULL DEFAULT 0,
    -- An admin's own remark. Never merged with `address_note`, which is the
    -- customer's own words and IS read back to them on the confirmation.
    ADD COLUMN "admin_note" TEXT;

-- Every pre-existing order was one course book with no delivery fee and no
-- discount, so its whole amount is the items line. Runs BEFORE the CHECK below
-- so the constraint is validated against already-correct rows.
UPDATE "app"."book_orders" SET "items_cents" = "amount_cents" WHERE "items_cents" = 0;

ALTER TABLE "app"."book_orders"
    ADD CONSTRAINT "book_orders_money_non_negative"
    CHECK ("items_cents" >= 0 AND "shipping_cents" >= 0 AND "discount_cents" >= 0);

-- The stored total must be the arithmetic the student was shown. Without this,
-- an admin edit that changes a line and forgets the total leaves the order
-- claiming one number on the invoice and another in the list, and nothing would
-- ever report it.
ALTER TABLE "app"."book_orders"
    ADD CONSTRAINT "book_orders_amount_is_the_sum"
    CHECK ("amount_cents" = "items_cents" + "shipping_cents" - "discount_cents");

-- A discount cannot exceed what is being discounted.
ALTER TABLE "app"."book_orders"
    ADD CONSTRAINT "book_orders_discount_within_order"
    CHECK ("discount_cents" <= "items_cents" + "shipping_cents");

-- ── backfill ────────────────────────────────────────────────────────────────

-- Every course that already sells a printed book becomes a catalogue entry, so
-- the shop opens with the books the platform already has rather than an empty
-- page waiting on data entry. `courses_book_needs_price_and_title` guarantees
-- the two columns are either both set or both null, so the WHERE only has to
-- test one — it tests both anyway, because a constraint is not a reason to
-- write a query that breaks if it is ever relaxed.
--
-- The course slug is reused verbatim as the book slug: it is already unique
-- across courses, `books` is empty at this point, and a derived slug that
-- differs from the course's own would be one more thing to keep in step.
INSERT INTO "app"."books" (
    "id", "slug", "title_ar", "subject_id", "year", "term", "course_id",
    "price_cents", "is_active", "sort_order", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    c."slug",
    c."book_title",
    c."subject_id",
    c."year",
    -- The course columns carry no term, and guessing one would file a
    -- whole-year book under a half it does not cover.
    'full'::"app"."book_term",
    c."id",
    c."book_price_cents",
    -- Only a published course's book goes on sale. A draft course's book is
    -- not something the shop should start taking money for.
    (c."status" = 'published'),
    c."position",
    now(),
    now()
FROM "app"."courses" c
WHERE c."book_title" IS NOT NULL AND c."book_price_cents" IS NOT NULL;

-- Every pre-existing order gets the one line it always implicitly had, pointed
-- at the catalogue entry created just above so the admin screen can show it
-- like any other order. `title_ar` falls back to the course title on the
-- theoretical row whose course lost its book between then and now — a line with
-- no name at all is worse than one named after its course.
INSERT INTO "app"."book_order_items" (
    "id", "order_id", "book_id", "title_ar", "unit_price_cents", "quantity"
)
SELECT
    gen_random_uuid(),
    o."id",
    b."id",
    COALESCE(c."book_title", c."title"),
    o."amount_cents",
    1
FROM "app"."book_orders" o
JOIN "app"."courses" c ON c."id" = o."course_id"
LEFT JOIN "app"."books" b ON b."course_id" = c."id"
WHERE o."course_id" IS NOT NULL;
