-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('mcq_single', 'mcq_multi', 'true_false', 'short_answer', 'essay');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('draft', 'ready', 'hidden');

-- CreateEnum
CREATE TYPE "QuestionOwnerScope" AS ENUM ('global', 'instructor', 'course');

-- NOTE: Prisma's diff engine generated a spurious `DROP CONSTRAINT
-- "lessons_section_matches_course"` here, as it does on every `migrate dev`
-- run — that composite FK cannot be expressed in schema.prisma so Prisma
-- always sees it as drift. Stripped by hand; DO NOT reintroduce it. Verify
-- with:
--   psql -d ayman_platform_dev -tAc "SELECT conname FROM pg_constraint WHERE conname='lessons_section_matches_course';"

-- CreateTable
CREATE TABLE "question_categories" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "owner_scope" "QuestionOwnerScope" NOT NULL DEFAULT 'global',
    "owner_id" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_entries" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "external_ref" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" TEXT NOT NULL,
    "bank_entry_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'draft',
    "type" "QuestionType" NOT NULL,
    "stem_html" TEXT NOT NULL,
    "general_feedback_html" TEXT,
    "default_mark" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "penalty" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "question_version_id" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "answer_pattern" TEXT,
    "fraction" DECIMAL(10,6) NOT NULL,
    "feedback_html" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_categories_parent_id_idx" ON "question_categories"("parent_id");

-- CreateIndex
CREATE INDEX "question_bank_entries_category_id_idx" ON "question_bank_entries"("category_id");

-- CreateIndex
CREATE INDEX "question_versions_bank_entry_id_status_idx" ON "question_versions"("bank_entry_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_bank_entry_id_version_key" ON "question_versions"("bank_entry_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_version_id_position_key" ON "question_options"("question_version_id", "position");

-- AddForeignKey
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_entries" ADD CONSTRAINT "question_bank_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "question_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_entries" ADD CONSTRAINT "question_bank_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_bank_entry_id_fkey" FOREIGN KEY ("bank_entry_id") REFERENCES "question_bank_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
