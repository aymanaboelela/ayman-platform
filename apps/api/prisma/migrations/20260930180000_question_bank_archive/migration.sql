-- «عاوز مكان أحذف سؤال من بنك الأسئلة» — the soft half of deleting a question.
--
-- A question somebody already answered cannot be deleted: its versions are
-- what every past attempt's review renders (`attempt_questions`, RESTRICT) and
-- what the games' statistics count (`game_answers`, CASCADE — a hard delete
-- would silently take those answers with it). So deleting one ARCHIVES it:
-- it leaves the bank list, the slot picker, the random pools and the games,
-- and nothing that points at it moves. A question nobody answered is deleted
-- outright, and needs nothing from this column.
--
-- Additive, NULLABLE, no default: NULL means «in the bank», so every existing
-- question on every stack stays exactly where it is the moment this runs, and
-- nothing is backfilled. Adding a nullable column with no default is a
-- catalogue-only change in Postgres — no table rewrite, no long lock.
--
-- No index: every read filters on `archived_at IS NULL` alongside the
-- category or the entry id it already has an index for, and the bank is a few
-- thousand rows at most.
ALTER TABLE "app"."question_bank_entries"
  ADD COLUMN "archived_at" TIMESTAMP(3);
