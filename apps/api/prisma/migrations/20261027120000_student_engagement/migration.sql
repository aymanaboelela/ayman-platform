-- ═══════════════════════════════════════════════════════════════════════════
-- Student engagement: «سؤال اليوم», «ملاحظاتي», «خطة المذاكرة», «أوسمتي».
--
-- Four small tables, all keyed on the student and all cascading with them.
-- «ملخص الشهر» adds nothing here: it reads the rows that already exist.
--
-- `daily_answers.question_version_id` (and its course/lesson labels) carry no
-- foreign key on purpose — the bank may delete an old version, and a cascade
-- would erase a day of a streak that really happened. The read side tolerates
-- a version that is gone.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."daily_answers" (
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "question_version_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "option_id" UUID,
    "was_right" BOOLEAN,
    "dealt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "daily_answers_pkey" PRIMARY KEY ("user_id","day"),
    -- Answered is all three or none of them.
    CONSTRAINT "daily_answers_answer_check"
      CHECK (("answered_at" IS NULL) = ("was_right" IS NULL))
);

CREATE TABLE "app"."lesson_notes" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "lesson_id" UUID NOT NULL,
    "position_seconds" INTEGER,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lesson_notes_body_check" CHECK (length("body") BETWEEN 1 AND 1000),
    CONSTRAINT "lesson_notes_position_check" CHECK ("position_seconds" IS NULL OR "position_seconds" >= 0)
);

CREATE TABLE "app"."study_plans" (
    "user_id" TEXT NOT NULL,
    "exam_date" DATE NOT NULL,
    "days_off" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "study_plans_days_off_check" CHECK ("days_off" <@ ARRAY[0,1,2,3,4,5,6])
);

CREATE TABLE "app"."student_badges" (
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("user_id","key")
);

CREATE INDEX "lesson_notes_user_id_lesson_id_idx" ON "app"."lesson_notes"("user_id", "lesson_id");
CREATE INDEX "lesson_notes_user_id_created_at_idx" ON "app"."lesson_notes"("user_id", "created_at" DESC);
CREATE INDEX "lesson_notes_lesson_id_idx" ON "app"."lesson_notes"("lesson_id");

ALTER TABLE "app"."daily_answers" ADD CONSTRAINT "daily_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_notes" ADD CONSTRAINT "lesson_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."lesson_notes" ADD CONSTRAINT "lesson_notes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."study_plans" ADD CONSTRAINT "study_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."student_badges" ADD CONSTRAINT "student_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
