-- Drops `quiz_slots_quiz_paper_idx`, added two migrations ago and redundant
-- the moment it was written: `quiz_slots_quiz_id_paper_position_key` is a
-- btree on (quiz_id, paper, position), and a lookup by (quiz_id, paper) is
-- served by that index's leading prefix. A second index over the same prefix
-- buys no reads and costs every write.
--
-- Separate file for the same reason as the last one: the migration that
-- created it has been applied, and editing an applied migration breaks the
-- checksum `_prisma_migrations` keeps in order to detect exactly that.

DROP INDEX IF EXISTS "app"."quiz_slots_quiz_paper_idx";
