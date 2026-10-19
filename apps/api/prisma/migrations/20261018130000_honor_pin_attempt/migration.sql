-- ═══════════════════════════════════════════════════════════════════════════
-- «الأوائل من امتحان الشهر» — a hand-ranked pin that remembers its paper.
--
-- The instructor now picks the month exam's top ten from `/admin/honor-board`
-- and states who is first, second, … himself. Those land in
-- `honor_board_pins` (the rank is HIS, not the score's), and this column ties
-- each one back to the paper it was earned on, for three reasons:
--
--   · the public card can print the mark («48 / 50») the way an exam card
--     always has, instead of the bare reason line a hand-added pin gets;
--   · re-publishing the same exam's board UPDATES the existing rows instead
--     of duplicating them (and does not re-notify students already on it);
--   · the archive rail can name the exam the round was for.
--
-- Nullable: every pin added by hand before this, and every one added by hand
-- after it, has no paper. `ON DELETE SET NULL`, not CASCADE — a paper removed
-- later does not take away an honour that was already given.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."honor_board_pins" ADD COLUMN "attempt_id" UUID;

ALTER TABLE "app"."honor_board_pins"
  ADD CONSTRAINT "honor_board_pins_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "app"."quiz_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One pin per paper. Two cards for one sitting would be the same student
-- twice on one board.
CREATE UNIQUE INDEX "honor_board_pins_attempt_id_key"
  ON "app"."honor_board_pins" ("attempt_id");
