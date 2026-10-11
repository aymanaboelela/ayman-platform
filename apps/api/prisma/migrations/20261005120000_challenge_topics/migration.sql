-- «قسم التحديات» — مواضيع يحددها الأدمن لكل كورس، و«ماتكرّرش السؤال»، وربط
-- السؤال بدرس وبمجموعة صيغ. كله إضافة: مفيش عمود قديم بيتغيّر، ومفيش صف
-- بيتكتب، فالستاكات التانية (من غير «تحديات») بتفضل زي ما هي بالظبط.

-- CreateTable
CREATE TABLE "app"."challenge_topics" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "section_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "lesson_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_topics_pkey" PRIMARY KEY ("id"),
    -- تحدّي من غير وحدة ولا درس مالوش أسئلة — مايتعملش أصلًا.
    CONSTRAINT "challenge_topics_has_scope"
      CHECK (COALESCE(cardinality("section_ids"), 0) + COALESCE(cardinality("lesson_ids"), 0) > 0),
    CONSTRAINT "challenge_topics_title_present" CHECK (length(btrim("title")) > 0)
);

-- CreateTable
CREATE TABLE "app"."question_exposures" (
    "user_id" TEXT NOT NULL,
    "group_key" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "times" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "question_exposures_pkey" PRIMARY KEY ("user_id","group_key")
);

-- AlterTable
ALTER TABLE "app"."game_sessions" ADD COLUMN "practice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "topic_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- AlterTable
ALTER TABLE "app"."question_bank_entries" ADD COLUMN "lesson_id" UUID,
ADD COLUMN "variant_group_key" TEXT;

-- مفتاح المجموعة بيتكتب في لصق الأسئلة بإيد المدرّس — سطر فاضي مش مجموعة.
ALTER TABLE "app"."question_bank_entries" ADD CONSTRAINT "question_bank_entries_variant_group_key_present"
  CHECK ("variant_group_key" IS NULL OR length(btrim("variant_group_key")) > 0);

-- CreateIndex
CREATE INDEX "challenge_topics_course_id_position_idx" ON "app"."challenge_topics"("course_id", "position");

-- CreateIndex
CREATE INDEX "question_exposures_user_id_last_seen_at_idx" ON "app"."question_exposures"("user_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "question_bank_entries_lesson_id_idx" ON "app"."question_bank_entries"("lesson_id");

-- CreateIndex
CREATE INDEX "question_bank_entries_variant_group_key_idx" ON "app"."question_bank_entries"("variant_group_key");

-- AddForeignKey
ALTER TABLE "app"."question_bank_entries" ADD CONSTRAINT "question_bank_entries_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."challenge_topics" ADD CONSTRAINT "challenge_topics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."question_exposures" ADD CONSTRAINT "question_exposures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
