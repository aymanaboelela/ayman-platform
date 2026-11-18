-- «السؤال المقالي اليومي» — one written question a day, answered on paper
-- (photographed) or typed, and marked by hand against a model answer.
--
-- Additive only: one enum and four new tables, no change to any existing row.
-- No GRANT: `ALTER DEFAULT PRIVILEGES` in the entrypoint covers new tables.
--
-- ## Four tables, the same split as الواجب
--
-- `daily_essays` is the question on its day, `daily_essay_courses` is who it
-- is for, `daily_essay_submissions` is that a student answered, and
-- `daily_essay_images` is the bytes. Marking deletes the image ROWS and keeps
-- the submission, so the student's page still reads the mark and «سلّمت ٣ صور»
-- after the photographs themselves are gone.

CREATE TYPE "app"."daily_essay_status" AS ENUM ('submitted', 'marked');

-- ── the question ───────────────────────────────────────────────────────────

CREATE TABLE "app"."daily_essays" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "model_answer" TEXT NOT NULL,
    "max_marks" INTEGER NOT NULL DEFAULT 10,
    "max_images" INTEGER NOT NULL DEFAULT 4,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_essays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_essays_day_idx" ON "app"."daily_essays" ("day");

-- Same bounds as the contract (`DailyEssayWriteSchema`). A question a student
-- reads on a phone before picking up a pen is not four thousand characters,
-- and one with no model answer cannot be marked consistently by three people.
ALTER TABLE "app"."daily_essays"
  ADD CONSTRAINT "daily_essays_body_length"
  CHECK (char_length(btrim("body")) BETWEEN 3 AND 4000);

ALTER TABLE "app"."daily_essays"
  ADD CONSTRAINT "daily_essays_model_answer_length"
  CHECK (char_length(btrim("model_answer")) BETWEEN 1 AND 8000);

ALTER TABLE "app"."daily_essays"
  ADD CONSTRAINT "daily_essays_max_marks_range"
  CHECK ("max_marks" BETWEEN 1 AND 100);

ALTER TABLE "app"."daily_essays"
  ADD CONSTRAINT "daily_essays_max_images_range"
  CHECK ("max_images" BETWEEN 1 AND 8);

-- ── who it is for ──────────────────────────────────────────────────────────

CREATE TABLE "app"."daily_essay_courses" (
    "essay_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,

    CONSTRAINT "daily_essay_courses_pkey" PRIMARY KEY ("essay_id", "course_id")
);

CREATE INDEX "daily_essay_courses_course_id_idx"
  ON "app"."daily_essay_courses" ("course_id");

ALTER TABLE "app"."daily_essay_courses"
    ADD CONSTRAINT "daily_essay_courses_essay_id_fkey"
    FOREIGN KEY ("essay_id") REFERENCES "app"."daily_essays"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."daily_essay_courses"
    ADD CONSTRAINT "daily_essay_courses_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── the answer ─────────────────────────────────────────────────────────────

CREATE TABLE "app"."daily_essay_submissions" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "app"."daily_essay_status" NOT NULL DEFAULT 'submitted',
    "image_count" INTEGER NOT NULL DEFAULT 0,
    "answer_text" TEXT,
    "mark" DECIMAL(5,2),
    "max_marks" INTEGER,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "images_purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_essay_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_essay_submissions_essay_id_user_id_key"
  ON "app"."daily_essay_submissions" ("essay_id", "user_id");

CREATE INDEX "daily_essay_submissions_status_submitted_at_idx"
  ON "app"."daily_essay_submissions" ("status", "submitted_at");

CREATE INDEX "daily_essay_submissions_user_id_submitted_at_idx"
  ON "app"."daily_essay_submissions" ("user_id", "submitted_at" DESC);

CREATE INDEX "daily_essay_submissions_submitted_at_idx"
  ON "app"."daily_essay_submissions" ("submitted_at");

-- RESTRICT on the question: a question with answers on it is a record of what
-- students were asked and how they were marked, so it is hidden, never deleted.
ALTER TABLE "app"."daily_essay_submissions"
    ADD CONSTRAINT "daily_essay_submissions_essay_id_fkey"
    FOREIGN KEY ("essay_id") REFERENCES "app"."daily_essays"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CASCADE on the student, SET NULL on the marker — the same split as
-- `homework_submissions`, for the same reasons.
ALTER TABLE "app"."daily_essay_submissions"
    ADD CONSTRAINT "daily_essay_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."daily_essay_submissions"
    ADD CONSTRAINT "daily_essay_submissions_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- The mark, its total and the status move together: a marked row has all
-- three, an unmarked row has none. A mark above its own total is a typo.
ALTER TABLE "app"."daily_essay_submissions"
  ADD CONSTRAINT "daily_essay_submissions_mark_consistent"
  CHECK (
    ("status" = 'submitted' AND "mark" IS NULL AND "max_marks" IS NULL AND "reviewed_at" IS NULL)
    OR
    ("status" = 'marked' AND "mark" IS NOT NULL AND "max_marks" IS NOT NULL AND "reviewed_at" IS NOT NULL
      AND "mark" >= 0 AND "mark" <= "max_marks")
  );

ALTER TABLE "app"."daily_essay_submissions"
  ADD CONSTRAINT "daily_essay_submissions_image_count_range"
  CHECK ("image_count" BETWEEN 0 AND 8);

ALTER TABLE "app"."daily_essay_submissions"
  ADD CONSTRAINT "daily_essay_submissions_answer_text_length"
  CHECK ("answer_text" IS NULL OR char_length("answer_text") BETWEEN 1 AND 10000);

ALTER TABLE "app"."daily_essay_submissions"
  ADD CONSTRAINT "daily_essay_submissions_review_note_length"
  CHECK ("review_note" IS NULL OR char_length("review_note") <= 1000);

-- ── the photographs ────────────────────────────────────────────────────────

CREATE TABLE "app"."daily_essay_images" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_essay_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_essay_images_submission_id_position_idx"
  ON "app"."daily_essay_images" ("submission_id", "position");

ALTER TABLE "app"."daily_essay_images"
    ADD CONSTRAINT "daily_essay_images_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "app"."daily_essay_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
