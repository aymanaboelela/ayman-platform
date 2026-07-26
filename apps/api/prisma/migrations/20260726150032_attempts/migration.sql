-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('in_progress', 'overdue', 'submitted', 'pending_review', 'abandoned');

-- CreateEnum
CREATE TYPE "AttemptQuestionState" AS ENUM ('todo', 'complete', 'needs_grading', 'graded_right', 'graded_partial', 'graded_wrong');

-- CreateEnum
CREATE TYPE "AttemptEventKind" AS ENUM ('attempt_started', 'question_viewed', 'answer_saved', 'answer_cleared', 'flag_toggled', 'answer_checked', 'submitted', 'autosubmitted', 'abandoned', 'graded', 'regraded', 'appeal_opened', 'appeal_resolved', 'extra_time_granted', 'extra_attempt_granted', 'attempt_reopened', 'stale_write_rejected');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('open', 'under_review', 'accepted', 'rejected');

-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "state" "AttemptState" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_token" UUID NOT NULL,
    "raw_score" DECIMAL(10,4),
    "scaled_score" DECIMAL(10,4),
    "passed" BOOLEAN,
    "extra_time_seconds" INTEGER NOT NULL DEFAULT 0,
    "extra_attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_questions" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "slot_position" INTEGER NOT NULL,
    "question_version_id" TEXT NOT NULL,
    "option_order" INTEGER[],
    "max_mark" DECIMAL(10,4) NOT NULL,
    "min_fraction" DECIMAL(10,6) NOT NULL,
    "max_fraction" DECIMAL(10,6) NOT NULL,
    "response" JSONB,
    "response_seq" INTEGER NOT NULL DEFAULT 0,
    "fraction" DECIMAL(10,6),
    "mark" DECIMAL(10,4),
    "state" "AttemptQuestionState" NOT NULL DEFAULT 'todo',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "right_answer_text" TEXT,
    "response_text" TEXT,
    "answered_at" TIMESTAMP(3),
    "graded_at" TIMESTAMP(3),
    "graded_by" TEXT,
    "feedback_html" TEXT,

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_events" (
    "id" BIGSERIAL NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "attempt_question_id" TEXT,
    "seq" INTEGER NOT NULL,
    "kind" "AttemptEventKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_appeals" (
    "id" TEXT NOT NULL,
    "attempt_question_id" TEXT NOT NULL,
    "student_note" TEXT NOT NULL,
    "grade_before" DECIMAL(10,4) NOT NULL,
    "grade_after" DECIMAL(10,4),
    "status" "AppealStatus" NOT NULL DEFAULT 'open',
    "resolver_note" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_state_idx" ON "quiz_attempts"("quiz_id", "state");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_quiz_id_idx" ON "quiz_attempts"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_state_deadline_at_idx" ON "quiz_attempts"("state", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quiz_id_user_id_attempt_no_key" ON "quiz_attempts"("quiz_id", "user_id", "attempt_no");

-- CreateIndex
CREATE INDEX "attempt_questions_question_version_id_idx" ON "attempt_questions"("question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_slot_position_key" ON "attempt_questions"("attempt_id", "slot_position");

-- CreateIndex
CREATE INDEX "attempt_events_attempt_id_created_at_idx" ON "attempt_events"("attempt_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_events_attempt_id_seq_key" ON "attempt_events"("attempt_id", "seq");

-- CreateIndex
CREATE INDEX "grade_appeals_status_created_at_idx" ON "grade_appeals"("status", "created_at");

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_appeals" ADD CONSTRAINT "grade_appeals_attempt_question_id_fkey" FOREIGN KEY ("attempt_question_id") REFERENCES "attempt_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_appeals" ADD CONSTRAINT "grade_appeals_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
