-- CreateEnum
CREATE TYPE "QuizMode" AS ENUM ('practice', 'graded');

-- CreateEnum
CREATE TYPE "GradeMethod" AS ENUM ('highest', 'average', 'first', 'last');

-- CreateEnum
CREATE TYPE "OverdueHandling" AS ENUM ('autosubmit', 'graceperiod', 'autoabandon');

-- CreateEnum
CREATE TYPE "NavMethod" AS ENUM ('free', 'sequential');

-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- CreateTable
CREATE TABLE "quizzes" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "mode" "QuizMode" NOT NULL DEFAULT 'practice',
    "duration_seconds" INTEGER,
    "open_from" TIMESTAMP(3),
    "open_until" TIMESTAMP(3),
    "max_attempts" INTEGER NOT NULL DEFAULT 0,
    "grade_method" "GradeMethod" NOT NULL DEFAULT 'highest',
    "retry_cooldown_hours" INTEGER NOT NULL DEFAULT 24,
    "pass_percent" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "overdue_handling" "OverdueHandling" NOT NULL DEFAULT 'autosubmit',
    "grace_seconds" INTEGER NOT NULL DEFAULT 60,
    "nav_method" "NavMethod" NOT NULL DEFAULT 'free',
    "review_options" JSONB NOT NULL,
    "sum_marks" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "grade_out_of" DECIMAL(10,4) NOT NULL DEFAULT 100,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_slots" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 0,
    "bank_entry_id" TEXT,
    "pinned_version" INTEGER,
    "pool_id" TEXT,
    "max_mark" DECIMAL(10,4) NOT NULL,
    "require_previous" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quiz_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_pools" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pick_count" INTEGER NOT NULL,
    "points_per_question" DECIMAL(10,4) NOT NULL,
    "source_filter" JSONB NOT NULL,

    CONSTRAINT "quiz_pools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_lesson_id_key" ON "quizzes"("lesson_id");

-- CreateIndex
CREATE INDEX "quiz_slots_pool_id_idx" ON "quiz_slots"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_slots_quiz_id_position_key" ON "quiz_slots"("quiz_id", "position");

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_bank_entry_id_fkey" FOREIGN KEY ("bank_entry_id") REFERENCES "question_bank_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_slots" ADD CONSTRAINT "quiz_slots_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "quiz_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_pools" ADD CONSTRAINT "quiz_pools_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
