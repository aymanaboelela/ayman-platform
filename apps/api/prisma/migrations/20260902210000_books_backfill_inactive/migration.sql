-- الكتب المنقولة من الكورسات تتخبّى لحد ما تتراجع.
--
-- WHAT WENT WRONG
--
-- `20260902120000_book_catalog` opened the shop by back-filling a `books` row
-- from every course carrying `book_title`/`book_price_cents`, and published
-- them (`is_active` = the course's published state). It copied faithfully. The
-- problem is what the column actually holds: on production `courses.book_title`
-- is CTA copy, not a name —
--
--     حجز الكتاب هيتبعتلك لحد البيت
--
-- — which reads correctly where it was written, inside the «اطلب الكتاب»
-- dialog on the course page, and reads as a broken page when printed as the
-- title of a book at 250 EGP. `/books` opened showing two entries with that
-- sentence as their name, duplicated because the same course exists once for
-- عام and once for لغات.
--
-- WHAT THIS DOES
--
-- Takes those rows off the shelf. It does NOT delete them: the price, the
-- subject, the year and the link back to the course are all correct and worth
-- keeping, and every one of them is editable at `/admin/books/catalog`. Only
-- the decision to SELL them is withdrawn, so a human names them and picks a
-- term before a customer can order one.
--
-- WHY THE `title_ar` COMPARISON
--
-- It is the precise test for "nobody has reviewed this yet". A row whose title
-- still equals the course's `book_title` is one the backfill wrote and no one
-- has touched; a row that has been renamed has been looked at, and this must
-- not reach behind an admin and hide their work. So a rename — the exact thing
-- this migration is asking for — is also what makes a row immune to it.
--
-- Rows with no course behind them are never touched: nothing back-filled them.
--
-- WHAT SHOULD HAVE HAPPENED
--
-- The original backfill should have seeded `is_active = false` and let a human
-- promote each row. Publishing a guess is the mistake; this is the correction,
-- and the note in `books.is_active` now says so.

UPDATE "app"."books" b
SET "is_active" = false,
    "updated_at" = now()
FROM "app"."courses" c
WHERE b."course_id" = c."id"
  AND b."is_active" = true
  AND b."title_ar" = c."book_title";
