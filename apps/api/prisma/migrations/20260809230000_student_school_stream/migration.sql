-- ═══════════════════════════════════════════════════════════════════════════
-- مدرسة عام ولا مدرسة لغات — the student's own half of the stream split.
--
-- `20260808000000_school_stream` gave COURSES and LESSONS `for_general` +
-- `for_languages`, and the admin has been able to tag them ever since. Nothing
-- could act on that, because the other side of the comparison did not exist:
-- the platform knew which stream a course was for and had never asked a
-- student which stream they were in. This column is that missing half.
--
-- ## Why an enum, and not the same two booleans
--
-- A course can serve both audiences at once, which is why it got two
-- independent flags. A student attends ONE school, so «الاتنين» is not a state
-- they can be in — two booleans would make it representable, and every reader
-- would then have to decide what a `true, true` student means. An enum makes
-- the impossible state unspellable instead of merely discouraged.
--
-- ## Why nullable, with no default and no backfill
--
-- Onboarding requires an answer from here on, so every profile made from now
-- on has one. The rows that already exist do not, and there is no honest value
-- to backfill them with: defaulting to `general` would be the database
-- asserting a fact about a student nobody ever asked. NULL reads as "never
-- asked", which is what is actually true, and keeps those students
-- distinguishable from the ones who answered — which is exactly what a future
-- "we still need to know your school" prompt needs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."SchoolStream" AS ENUM ('general', 'languages');

ALTER TABLE "app"."student_profiles"
  ADD COLUMN "school_stream" "app"."SchoolStream";
