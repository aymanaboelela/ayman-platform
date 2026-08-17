-- «الصف الثاني بكالوريا» — the year label a البكالوريا student is actually in.
--
-- WHY BOTH THIS AND THE SEED EDIT
--
-- `apps/api/docker-entrypoint.sh` runs `node dist/scripts/seed.js` on EVERY
-- container boot (step ٣), so unlike `landing.*` in `ar.ts` — where the file is
-- only ever the first write and the row is the truth thereafter — the seed's
-- `update: { labelAr, badgeAr }` really does reach production. The edit in
-- `seed.ts` is therefore the load-bearing half, and this file is deliberate
-- redundancy for two reasons:
--
--   · ORDER. `prisma migrate deploy` is step ٢ and the seed is step ٣, so the
--     rows are already correct before anything reads them.
--   · The seed is allowed to FAIL. That same entrypoint runs it as
--     `node … || echo "WARNING — reference-data seed failed"` under `set -e`,
--     on the deliberate argument that a failed seed must not keep the API
--     down. A deploy where it fails is a deploy where the seed changed
--     nothing; this still did.
--
-- ⚠️ The two must move together. `seed.ts` overwrites `label_ar`
-- unconditionally on every boot, so editing only this file would be undone by
-- the next restart, and editing a label by hand in /admin/taxonomy/systems is
-- undone the same way. That is pre-existing behaviour and not something this
-- change introduces — but it is why "just fix it in the admin panel" is not an
-- answer to this bug.
--
-- WHAT WAS WRONG WITH THE OLD LABEL
--
-- «الثانوي» is correct inside الثانوية العامة and wrong inside البكالوريا, and
-- البكالوريا is the only system this platform teaches. The onboarding wizard
-- therefore offered «الصف الثاني الثانوي» in its year dropdown while the panel
-- underneath announced «النظام الدراسي: البكالوريا المصرية», and every public
-- page — `/years/[year]`, the library group headings, the identity strip —
-- said «الصف الثاني بكالوريا» about the same student. Three spellings, and the
-- one on the form that decides which courses they see was the odd one out.
--
-- WHY IT IS SCOPED TO ONE SYSTEM
--
-- الثانوية العامة keeps «الثانوي». It is not a rename of the word, it is the
-- label becoming per-system the way `badge_ar` already was. The join below is
-- what makes that true; a bare `UPDATE academic_years SET …` would rewrite
-- both systems and introduce the mirror image of this bug.
--
-- WHY THE WHERE CLAUSE MATCHES THE OLD TEXT
--
-- So a re-run is a no-op, and so this statement cannot be the thing that
-- clobbers a label somebody chose. A row that no longer says «الثانوي» is a
-- row somebody has decided about. (The seed one step later is not so careful —
-- see the ⚠️ above.)

UPDATE "app"."academic_years" AS y
SET "label_ar" = 'الصف الأول بكالوريا'
FROM "app"."education_systems" AS s
WHERE y."system_id" = s."id"
  AND s."slug" = 'bacalorya'
  AND y."year" = 1
  AND y."label_ar" = 'الصف الأول الثانوي';

UPDATE "app"."academic_years" AS y
SET "label_ar" = 'الصف الثاني بكالوريا'
FROM "app"."education_systems" AS s
WHERE y."system_id" = s."id"
  AND s."slug" = 'bacalorya'
  AND y."year" = 2
  AND y."label_ar" = 'الصف الثاني الثانوي';

UPDATE "app"."academic_years" AS y
SET "label_ar" = 'الصف الثالث بكالوريا'
FROM "app"."education_systems" AS s
WHERE y."system_id" = s."id"
  AND s."slug" = 'bacalorya'
  AND y."year" = 3
  AND y."label_ar" = 'الصف الثالث الثانوي';
