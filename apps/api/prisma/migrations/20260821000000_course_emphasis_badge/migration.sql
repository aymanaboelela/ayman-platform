-- «إجباري» / «موصى به» / «اختياري» on a course card.
--
-- WHAT PROBLEM THIS SOLVES
--
-- The catalog does not filter by the student's year — `CatalogService.list`
-- selects on `status` and the stream flags and nothing else, and `year` is
-- carried only so the card can print it. That is deliberate and staying: a
-- تأسيسي course is genuinely useful to more than one year, and hiding it from
-- the older one would be worse than showing it unranked.
--
-- But it left no way to SAY which course a given student should actually open
-- first. Two courses on one grid, both reachable, both looking equally
-- mandatory, and the instructor's answer — "the foundation one matters if you
-- are in first year, the curriculum one is the real work if you are in
-- second" — had nowhere to live except a sentence buried in the description.
--
-- WHY A LABEL AND NOT A FILTER
--
-- Because the honest answer is per-student and this column is per-course. A
-- filter would have to encode "required for year 1, optional for year 2" as
-- data and then be trusted to be right for a student whose year is nullable
-- (`student_profiles.year` is), whose profile predates onboarding, or who is
-- simply browsing. A badge that says what the teacher means, and a note that
-- says who it applies to, is correct for all of them and cannot lock anyone
-- out of anything.
--
-- Nothing reads this for access. Entitlement stays in `AccessGrant` and
-- visibility stays in `status` + the stream flags; see `requires_grant`'s own
-- note in schema.prisma for why deciding access from a column on the course is
-- the mistake this platform keeps not making.
--
-- WHY THE CHECK
--
-- `emphasis_note` is the line UNDER the badge. Without the badge it is a
-- sentence floating on a card with nothing to attach it to, which the card has
-- no design for — so the database refuses the state rather than leaving the
-- component to invent one. Both NULL is the default and is every existing row.

CREATE TYPE "app"."CourseEmphasis" AS ENUM ('required', 'recommended', 'optional');

ALTER TABLE "app"."courses"
  ADD COLUMN "emphasis" "app"."CourseEmphasis",
  ADD COLUMN "emphasis_note" TEXT;

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_note_needs_emphasis"
  CHECK ("emphasis_note" IS NULL OR "emphasis" IS NOT NULL);
