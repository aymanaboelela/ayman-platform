-- «الألعاب»: أسئلة لكل درس، إعداد لكل لعبة في كل كورس، وتسجيل كل جولة.
--
-- «عاوز مكان أحط فيه الأسئلة لكل صف وكل درس، وتتحط في المسابقات والألعاب
-- براحتي، وعاوز أعرف مين بيلعب وبيقعد قد إيه». كله إضافة — مفيش صف قديم
-- بيتغيّر، ومفيش عمود قديم بيتلمس:
--
--   · `question_categories.game_lesson_id` — تصنيف ابن لتصنيف ألعاب الكورس،
--     مربوط بدرس. الأسئلة بتتكتب وتتلصق بأدوات البنك نفسها؛ الجديد إن اللعبة
--     بتعرف السؤال ده بتاع أنهي درس، فالطالب يقدر يلعب درس لوحده. NULL على كل
--     تصنيف موجود.
--   · `game_mode_settings` — كل لعبة في كل كورس بتسحب منين (الكويزات، أسئلة
--     الألعاب، دروس معيّنة). جدول فاضي = كل كورس على الافتراضي = نفس سلوك
--     النهارده بالظبط.
--   · `game_sessions` + `game_answers` — جولة = صف، وإجابة = صف، بيكتبهم
--     السيرفر وقت ما بيوزّع الأسئلة وبيصحّح. المدة من ساعة السيرفر، مش من
--     المتصفح.
--
-- `game_sessions.question_ids` هي كمان اللي بتخلّي الإجابة سريعة: السيرفر
-- بيتأكد إن السؤال اتوزّع في الجولة دي من صف واحد، بدل ما يعيد حساب بنك
-- الطالب كله مع كل «أيوه، نهائية» (ومع كل قطعة صوت) زي ما كان.
--
-- العدّاد اسمه right_count والإجابة was_right، مش correct: schema.spec.ts
-- بيمنع أي عمود اسمه correct في الـschema كلها (الصح في البنك fraction بس).
--
-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES اللي
-- بيغطّي أي جدول جديد.

-- CreateEnum
CREATE TYPE "app"."game_mode" AS ENUM ('race', 'millionaire', 'survival');

-- CreateEnum
CREATE TYPE "app"."game_level" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "app"."game_outcome" AS ENUM ('won', 'walked', 'lost', 'finished');

-- AlterTable
ALTER TABLE "app"."question_categories" ADD COLUMN     "game_lesson_id" UUID;

-- CreateTable
CREATE TABLE "app"."game_mode_settings" (
    "course_id" UUID NOT NULL,
    "mode" "app"."game_mode" NOT NULL,
    "use_quizzes" BOOLEAN NOT NULL DEFAULT true,
    "use_bank" BOOLEAN NOT NULL DEFAULT true,
    "lesson_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_mode_settings_pkey" PRIMARY KEY ("course_id","mode")
);

-- CreateTable
CREATE TABLE "app"."game_sessions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" UUID,
    "section_id" UUID,
    "lesson_id" UUID,
    "mode" "app"."game_mode" NOT NULL,
    "level" "app"."game_level" NOT NULL,
    "question_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "right_count" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "outcome" "app"."game_outcome",
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."game_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "option_id" UUID,
    "was_right" BOOLEAN NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_sessions_started_at_idx" ON "app"."game_sessions"("started_at");

-- CreateIndex
CREATE INDEX "game_sessions_user_id_started_at_idx" ON "app"."game_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "game_sessions_course_id_started_at_idx" ON "app"."game_sessions"("course_id", "started_at");

-- CreateIndex
CREATE INDEX "game_answers_question_version_id_idx" ON "app"."game_answers"("question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_answers_session_id_question_version_id_key" ON "app"."game_answers"("session_id", "question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_categories_game_lesson_id_key" ON "app"."question_categories"("game_lesson_id");

-- AddForeignKey
ALTER TABLE "app"."question_categories" ADD CONSTRAINT "question_categories_game_lesson_id_fkey" FOREIGN KEY ("game_lesson_id") REFERENCES "app"."lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_mode_settings" ADD CONSTRAINT "game_mode_settings_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_sessions" ADD CONSTRAINT "game_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_sessions" ADD CONSTRAINT "game_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_sessions" ADD CONSTRAINT "game_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "app"."course_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_sessions" ADD CONSTRAINT "game_sessions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_answers" ADD CONSTRAINT "game_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app"."game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."game_answers" ADD CONSTRAINT "game_answers_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "app"."question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- الإجابات مابتعدّيش الأسئلة، والصح مابيعدّيش الإجابات — بتتكتب من السيرفر
-- بس، والقيد ده شبكة تحتها. مش في schema.prisma لأن Prisma مابيعرفش يعبّر
-- عن CHECK (نفس عرف `courses_priced_requires_grant`).
ALTER TABLE "app"."game_sessions"
  ADD CONSTRAINT "game_sessions_counts_ck"
  CHECK ("answered" >= 0 AND "right_count" >= 0 AND "right_count" <= "answered" AND "answered" <= "question_count"
         AND "duration_seconds" >= 0 AND "score" >= 0);
