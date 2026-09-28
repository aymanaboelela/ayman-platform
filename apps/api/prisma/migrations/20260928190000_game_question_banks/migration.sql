-- «أسئلة الألعاب»: تصنيف في بنك الأسئلة مربوط بكورس = أسئلة الألعاب بتاعته.
--
-- عمود nullable على التصنيف مش جدول جديد: الأسئلة نفسها بتتكتب وتتنشر
-- وتتلصق بالجملة بنفس أدوات البنك (`question-bank.service.ts`)، والجديد إن
-- اللعبة بتعرف تسحب من تصنيف ما بكورسه. تصنيف قديم مالوش كورس = NULL، ومفيش
-- أي صف بيتغيّر.
--
-- UNIQUE: تصنيف ألعاب واحد لكل كورس. NULL مش بيتعدّ في UNIQUE في Postgres،
-- فكل التصنيفات العادية بتفضل زي ما هي.
ALTER TABLE "app"."question_categories"
  ADD COLUMN "game_course_id" UUID;

CREATE UNIQUE INDEX "question_categories_game_course_id_key"
  ON "app"."question_categories" ("game_course_id");

-- `SetNull`: كورس اتمسح، أسئلته تفضل في البنك كتصنيف عادي — مش بتتمسح معاه.
ALTER TABLE "app"."question_categories"
  ADD CONSTRAINT "question_categories_game_course_id_fkey"
  FOREIGN KEY ("game_course_id") REFERENCES "app"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
