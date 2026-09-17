-- كتاب البرمجة — تانية بكالوريا، عام ولغات.
--
-- The two rows `20260902120000_book_catalog` back-filled from the programming
-- courses, named properly and put back on the shelf.
-- `20260902210000_books_backfill_inactive` hid them because they still carried
-- `courses.book_title`, which is CTA copy («حجز الكتاب هيتبعتلك لحد البيت»)
-- rather than a name. Ayman supplied the real names, so this is the review that
-- migration was waiting for.
--
-- WHAT IS SET, AND WHAT IS DELIBERATELY LEFT ALONE
--
--   · `title_ar` — the real name, and the ONE fact that distinguishes the two
--     rows on screen. They differ only by stream, and the shop has no notion of
--     stream, so the name has to carry it or the shelf shows two identical
--     cards. That is exactly how it looked before.
--   · `term` → `first`. The backfill could not know it (the course columns
--     carry no term) and defaulted to `full`.
--   · `is_active` → true. The books go on sale.
--
-- NOT touched: `price_cents` (250 EGP, already correct), `compare_price_cents`
-- (NULL — «مفيش خصم»), `page_count` (NULL — «سيبك من الصفحات»), `cover_key`
-- (NULL until the photographs arrive; the card renders generated art in the
-- subject's hue meanwhile), `subject_id` and `year`, both already right.
--
-- WHY `for_general`/`for_languages` AND NOT THE SLUG
--
-- The slug ends in `-general`/`-languages` today and that is a naming
-- convention, not a guarantee. The two booleans on `courses` are the actual
-- record of which stream a course serves — the same pair `streamChoiceOf`
-- reads for the shipping-desk export — so they are what the CASE keys on.
-- A course serving BOTH streams matches neither branch and is left untouched
-- rather than guessed at.

UPDATE "app"."books" b
SET "title_ar" = CASE
      WHEN c."for_languages" AND NOT c."for_general" THEN 'كتاب البرمجة — تانية بكالوريا لغات'
      WHEN c."for_general" AND NOT c."for_languages" THEN 'كتاب البرمجة — تانية بكالوريا عام'
      ELSE b."title_ar"
    END,
    "term" = 'first'::"app"."book_term",
    "is_active" = true,
    "updated_at" = now()
FROM "app"."courses" c
WHERE b."course_id" = c."id"
  -- Only the rows the backfill wrote and nobody has renamed since — the same
  -- test the hide migration used, so an edit made in the admin screen between
  -- the two deploys wins over this file.
  AND b."title_ar" = c."book_title"
  AND (c."for_general" <> c."for_languages");
