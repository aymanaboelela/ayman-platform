-- The hero's rotating second line: four phrases that all opened with «لحد».
--
-- WHY A MIGRATION AND NOT JUST A COPY EDIT
--
-- `landing.heroRotating` in `ar.ts` is only the SEED. `DEFAULT_HOME_BLOCKS`
-- writes it into `app.home_blocks` on first seed, and from then on the row is
-- what the site renders — /admin/home edits it. So editing `ar.ts` alone
-- changes the default for a database that has never been seeded and NOTHING
-- on a site that has, which is every real deployment. The copy would have
-- looked fixed in the repo and unchanged on the page.
--
-- WHY IT IS SAFE
--
-- The WHERE clause requires the stored array to still be EXACTLY the old
-- seeded default. If the instructor has edited these lines from /admin/home,
-- the arrays differ, no row matches, and their words are left alone — this
-- must never overwrite somebody's own copy. If the row does not exist, the
-- statement is a no-op and the new `ar.ts` default applies on the next seed.
--
-- Re-running it is also a no-op: after the first run the array no longer
-- matches the old value.
UPDATE app.home_blocks
SET props = jsonb_set(
      props,
      '{rotatingAr}',
      '["لحد آخر سؤال في الامتحان.", "لأول مشروع تكتبه لوحدك.", "لآخر تمرين من غير مساعدة.", "لليوم اللي تبطّل تحفظ فيه."]'::jsonb
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'hero'
  AND props->'rotatingAr' = '["لحد آخر سؤال في الامتحان.", "لحد ما الفكرة تبقى بديهية.", "لحد أول مشروع تكتبه لوحدك.", "لحد ما تبطّل تحفظ خالص."]'::jsonb;
