-- «أقيّم كل واحد عشان أطلّع الأول» + لوحة الشرف.
--
-- Two nullable columns on `quiz_attempts`. Both are `ADD COLUMN ... NULL` with
-- no default, which Postgres does as a catalogue-only change — no table
-- rewrite on what is already the largest table here.
--
-- ## instructor_rating
--
-- The score cannot settle the question actually being asked: ten students
-- reach 100/100 and only one can be الأول. The mark says whether the answers
-- were right; this says how they were written, and it is what the honour board
-- orders on before falling back to the score.
--
-- CHECKed 1..5 rather than left open. A stray 50 from a mistyped field would
-- otherwise outrank every real rating on the board silently, and a CHECK is
-- the only place that rule cannot be forgotten by a future caller.
--
-- ## honor_board_at
--
-- ⚠️ A row here publishes a student's NAME AND AVATAR on the public landing
-- page. It is therefore an explicit act with its own column and its own admin
-- control, never derived from the score — a board that filled itself would put
-- a child's photograph on the internet because they did well on a quiz, and
-- that is not a decision code gets to make.
--
-- A timestamp rather than a boolean: the board gets a stable secondary order
-- (who went up first) with no second column, and "when was this added" stays
-- answerable without crawling the audit log.

ALTER TABLE "app"."quiz_attempts"
  ADD COLUMN "instructor_rating" SMALLINT,
  ADD COLUMN "honor_board_at" TIMESTAMPTZ(3);

ALTER TABLE "app"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_instructor_rating_range"
  CHECK ("instructor_rating" IS NULL OR ("instructor_rating" BETWEEN 1 AND 5));

-- The landing page reads "who is on the board" on every cold render, and that
-- is a handful of rows out of every attempt ever sat. A partial index keeps it
-- a lookup rather than a scan — and the index only covers the rows that are
-- actually on the board, so it stays small however large the table grows.
CREATE INDEX "quiz_attempts_honor_board_idx"
  ON "app"."quiz_attempts" ("honor_board_at" DESC)
  WHERE "honor_board_at" IS NOT NULL;
