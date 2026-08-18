-- Every lesson of a course is reachable from the day the student enrols. The
-- only gate left is the final exam, which `resolveGate` derives from
-- `courses.exam_lesson_id` — so the per-course release mode has nothing left
-- to say and is removed rather than left as a column that reads as if it did.
--
-- Why it went, in one sentence: the chain it drove gated lecture N+1 on
-- `lesson_progress.state` for lecture N, and that column records whether the
-- student pressed «خلاص · التالي» — not whether they watched anything. So it
-- showed the identical padlock to the student who had done the work and the
-- student who had not, and the padlock's dialog then pointed at the lecture
-- they were already sitting on. See `gate-rule.ts` for the full reasoning and
-- for why the exam is the one thing still closed.
--
-- Nothing reads the column before this runs: `LessonGateService` stopped
-- selecting it and `PlayerService` stopped returning it in the same commit, so
-- there is no window in which a deployed server queries a dropped column.
-- Dropping it is also what makes the change permanent — a course row that can
-- still say `sequential` is a lock waiting to come back on.
ALTER TABLE app.courses DROP COLUMN IF EXISTS progression_mode;

-- The type is used by nothing else (it was declared for this column alone), so
-- it goes with it. `IF EXISTS` on both statements so re-running the migration
-- against an already-migrated database is a no-op rather than an error.
DROP TYPE IF EXISTS app.progression_mode;
