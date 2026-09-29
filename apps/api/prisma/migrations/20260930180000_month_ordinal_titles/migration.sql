-- «وأنا بشترك في الكورس بيبقى فيه شهر 1 شهر 2 — لا، عاوز يبقى مكتوب الشهر
-- الأول، الشهر الثاني، الشهر الثالث».
--
-- A month's title is stored, and every month made by «خلّي الكورس بالشهور» or
-- «كمّل الشهور» was born «شهر ١»، «شهر ٢»… — which is what the student reads
-- on the checkout. New months are now born «الشهر الأول»… (see
-- `@ayman/contracts/month-title`); this renames the ones that already exist.
--
-- ONLY a title that is still exactly the old default FOR ITS OWN INDEX:
-- «شهر ٣» on month 3, in Arabic-Indic or Latin digits. Anything the instructor
-- typed — «شهر ٣ — نوفمبر», «شهر المراجعة», or «شهر ٢» sitting on month 5 —
-- is his, and is left as it is. Same ordinals as `defaultMonthTitle`; 1..12 is
-- the column's own CHECK.
--
-- Data only, no DDL, and idempotent: a renamed title no longer matches.
UPDATE "app"."course_months"
SET
  "title" = 'الشهر ' || (ARRAY[
    'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
    'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'
  ])["month_index"],
  "updated_at" = CURRENT_TIMESTAMP
WHERE "month_index" BETWEEN 1 AND 12
  AND btrim(translate("title", '٠١٢٣٤٥٦٧٨٩', '0123456789')) = 'شهر ' || "month_index";
