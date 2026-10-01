-- CreateTable
CREATE TABLE "app"."mistake_reviews" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_version_id" UUID NOT NULL,
    "streak_right" INTEGER NOT NULL DEFAULT 0,
    "mastered_at" TIMESTAMP(3),
    "last_reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mistake_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mistake_reviews_user_id_question_version_id_key" ON "app"."mistake_reviews"("user_id", "question_version_id");

-- CreateIndex
CREATE INDEX "mistake_reviews_user_id_mastered_at_idx" ON "app"."mistake_reviews"("user_id", "mastered_at");

-- AddForeignKey
ALTER TABLE "app"."mistake_reviews" ADD CONSTRAINT "mistake_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."mistake_reviews" ADD CONSTRAINT "mistake_reviews_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "app"."question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
