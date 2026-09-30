-- «ساحة التحدي» — ماتش مباشر بين طالبين من نفس الدفعة ونفس الكورس.
--
-- كله إضافة: تلات جداول جديدة ونوعين enum، ومفيش صف قديم ولا عمود قديم
-- بيتلمس. الماتش وهو شغّال عايش في Redis (الطابور، الساعة، القفل)؛ الجداول
-- دي بتتكتب مرة واحدة في آخر الماتش:
--
--   · `arena_matches` — النتيجة، والكسبان، والنقط اللي دخلت فعلًا بعد السقف.
--     `id` هو نفس id الماتش في Redis، فنهايتين لنفس الماتش = صف واحد.
--   · `arena_rounds` — كل سؤال: مين خد النقطة وليه، وكل لاعب اختار إيه وبعد
--     قد إيه بساعة السيرفر. `question_version_id` بـSET NULL: سؤال اتمسح من
--     البنك مابيمسحش نتيجة ماتش.
--   · `arena_stats` — رصيد الساحة لكل طالب، بيتزوّد في نفس الترانزاكشن. منفصل
--     عن نقط الترتيب عن قصد.
--
-- الإجابة was_right_a/was_right_b مش correct: schema.spec.ts بيمنع أي عمود
-- اسمه correct (الصح في البنك fraction بس).
--
-- مفيش GRANT: scripts/db-bootstrap.sql فيه ALTER DEFAULT PRIVILEGES اللي
-- بيغطّي أي جدول جديد.

-- CreateEnum
CREATE TYPE "app"."arena_match_outcome" AS ENUM ('completed', 'forfeit', 'abandoned', 'aborted');

-- CreateEnum
CREATE TYPE "app"."arena_round_reason" AS ENUM ('correct', 'both_wrong', 'timeout');

-- CreateTable
CREATE TABLE "app"."arena_matches" (
    "id" UUID NOT NULL,
    "course_id" UUID,
    "player_a_id" TEXT NOT NULL,
    "player_b_id" TEXT NOT NULL,
    "score_a" INTEGER NOT NULL DEFAULT 0,
    "score_b" INTEGER NOT NULL DEFAULT 0,
    "winner_id" TEXT,
    "outcome" "app"."arena_match_outcome" NOT NULL,
    "points_a" INTEGER NOT NULL DEFAULT 0,
    "points_b" INTEGER NOT NULL DEFAULT 0,
    "question_count" INTEGER NOT NULL,
    "cohort_label" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arena_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."arena_rounds" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_version_id" UUID,
    "winner_side" TEXT,
    "reason" "app"."arena_round_reason" NOT NULL,
    "option_a" UUID,
    "ms_a" INTEGER,
    "was_right_a" BOOLEAN,
    "option_b" UUID,
    "ms_b" INTEGER,
    "was_right_b" BOOLEAN,

    CONSTRAINT "arena_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."arena_stats" (
    "user_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "played" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "arena_matches_ended_at_idx" ON "app"."arena_matches"("ended_at");

-- CreateIndex
CREATE INDEX "arena_matches_player_a_id_ended_at_idx" ON "app"."arena_matches"("player_a_id", "ended_at");

-- CreateIndex
CREATE INDEX "arena_matches_player_b_id_ended_at_idx" ON "app"."arena_matches"("player_b_id", "ended_at");

-- CreateIndex
CREATE INDEX "arena_rounds_question_version_id_idx" ON "app"."arena_rounds"("question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "arena_rounds_match_id_position_key" ON "app"."arena_rounds"("match_id", "position");

-- CreateIndex
CREATE INDEX "arena_stats_points_idx" ON "app"."arena_stats"("points" DESC);

-- AddForeignKey
ALTER TABLE "app"."arena_matches" ADD CONSTRAINT "arena_matches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."arena_matches" ADD CONSTRAINT "arena_matches_player_a_id_fkey" FOREIGN KEY ("player_a_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."arena_matches" ADD CONSTRAINT "arena_matches_player_b_id_fkey" FOREIGN KEY ("player_b_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."arena_matches" ADD CONSTRAINT "arena_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."arena_rounds" ADD CONSTRAINT "arena_rounds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "app"."arena_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."arena_rounds" ADD CONSTRAINT "arena_rounds_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "app"."question_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."arena_stats" ADD CONSTRAINT "arena_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- القيود اللي Prisma مابيعرفش يعبّر عنها (نفس عرف game_sessions_counts_ck):
-- لاعب مابيلعبش قدام نفسه، والكسبان واحد من الاتنين، ومفيش رقم سالب.
ALTER TABLE "app"."arena_matches"
  ADD CONSTRAINT "arena_matches_two_players_ck" CHECK ("player_a_id" <> "player_b_id"),
  ADD CONSTRAINT "arena_matches_winner_ck"
    CHECK ("winner_id" IS NULL OR "winner_id" = "player_a_id" OR "winner_id" = "player_b_id"),
  ADD CONSTRAINT "arena_matches_counts_ck"
    CHECK ("score_a" >= 0 AND "score_b" >= 0 AND "points_a" >= 0 AND "points_b" >= 0
           AND "question_count" >= 0 AND "score_a" + "score_b" <= "question_count");

ALTER TABLE "app"."arena_rounds"
  ADD CONSTRAINT "arena_rounds_winner_side_ck" CHECK ("winner_side" IS NULL OR "winner_side" IN ('a', 'b')),
  ADD CONSTRAINT "arena_rounds_ms_ck" CHECK (("ms_a" IS NULL OR "ms_a" >= 0) AND ("ms_b" IS NULL OR "ms_b" >= 0));

ALTER TABLE "app"."arena_stats"
  ADD CONSTRAINT "arena_stats_counts_ck"
    CHECK ("points" >= 0 AND "wins" >= 0 AND "draws" >= 0 AND "losses" >= 0
           AND "played" >= 0 AND "wins" + "draws" + "losses" <= "played");
