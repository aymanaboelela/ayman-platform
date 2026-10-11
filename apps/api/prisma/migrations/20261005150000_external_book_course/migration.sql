-- «التحديات» من كتاب خارجي — الكتاب بيتربط بكورس، ودروسه (تصنيفات تحت وحداته)
-- بتتربط بمحاضرات الكورس بالترتيب وقت ما التحديات بتتحسب، مش بعمود على كل
-- سؤال. كده محاضرة تتضاف بكرة بتلاقي أسئلتها من غير ما حد يلمس البنك.
ALTER TABLE "app"."external_books" ADD COLUMN "course_id" UUID;

CREATE INDEX "external_books_course_id_idx" ON "app"."external_books" ("course_id");

-- `SetNull`: كورس اتمسح، الكتاب وأسئلته فاضلين — بس مابقوش بيغذّوا حاجة.
ALTER TABLE "app"."external_books"
  ADD CONSTRAINT "external_books_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
