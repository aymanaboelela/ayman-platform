-- ═══════════════════════════════════════════════════════════════════════════
-- مدارس لغات ولا عام: which stream a course, and each lesson in it, is for.
--
-- Orthogonal to the existing taxonomy, not a part of it. `education_systems`
-- already answers "البكالوريا ولا الثانوية العامة" and `tracks` answers "أي
-- مسار" — a language school and a general school sit inside the SAME system
-- and the SAME track, and differ in the language the subject is taught and
-- examined in. Folding this into either of those tables would have doubled
-- every row in them to express one independent bit.
--
-- ## Two booleans rather than a three-valued enum
--
-- `general | languages | both` reads tidier and is wrong the moment a third
-- stream exists: every addition multiplies the combinations that have to be
-- enumerated. Two independent flags cost one extra column and one CHECK, and
-- a future فرنسي stream is `ADD COLUMN` + widening that CHECK.
--
-- ## Why the default is TRUE on both, i.e. "الاتنين"
--
-- Every row that exists today is shown to everybody, because there is no
-- distinction yet. `true, true` is exactly that behaviour, so the migration
-- changes what nothing looks like to anyone. Defaulting to `general` only
-- would be this migration inventing a fact about content it has never seen —
-- and it would silently hide the live course from half the audience.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."courses"
  ADD COLUMN "for_general"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "for_languages" BOOLEAN NOT NULL DEFAULT true;

-- "لازم أختار" — a row serving neither stream is content nobody can ever
-- reach, so it is unrepresentable rather than merely discouraged. The form
-- mirrors this, but the form is not the thing that makes it true.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_serves_a_stream"
  CHECK ("for_general" OR "for_languages");

ALTER TABLE "app"."lessons"
  ADD COLUMN "for_general"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "for_languages" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "app"."lessons"
  ADD CONSTRAINT "lessons_serves_a_stream"
  CHECK ("for_general" OR "for_languages");

-- No index on either column, deliberately.
--
-- Both are low-cardinality booleans that are almost always TRUE, so a btree on
-- them is a scan with extra steps — Postgres would ignore it. The catalog's
-- selectivity comes from `courses_status_published_at_idx`, which already runs
-- first; the stream flags then filter a handful of rows in memory. Revisit
-- only if a stream ever becomes rare enough to justify a PARTIAL index, which
-- is the shape that would actually pay for itself.
