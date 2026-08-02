-- A course's final exam is one of its OWN lessons, of kind `quiz`.
--
-- Modelling it as a lesson rather than as a second kind of quiz owner is what
-- lets the entire quiz engine apply to it unchanged — see the schema comment on
-- `Course.examLessonId` and spec §4.4.

ALTER TABLE "app"."courses" ADD COLUMN "exam_lesson_id" UUID;

CREATE UNIQUE INDEX "courses_exam_lesson_id_key"
  ON "app"."courses" ("exam_lesson_id");

-- The unique half of the composite FK below. Prisma declares this too
-- (`lessons_id_course_key`) so its drift check stays quiet.
CREATE UNIQUE INDEX "lessons_id_course_key"
  ON "app"."lessons" ("id", "course_id");

-- Plain FK: deleting the exam lesson unsets the pointer rather than cascading
-- the course away.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_exam_lesson_id_fkey"
  FOREIGN KEY ("exam_lesson_id") REFERENCES "app"."lessons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The one that matters: a course's exam must be a lesson OF THAT COURSE.
-- Without this, an admin (or a bug) could point one course's exam at another
-- course's lesson, and every gate downstream would silently authorize against
-- the wrong content. The service validates this too; this is the half that
-- survives a direct SQL write.
--
-- `MATCH SIMPLE` (the default) means the constraint is satisfied when
-- `exam_lesson_id` is NULL, which is exactly right — most courses have no exam.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_exam_lesson_in_same_course"
  FOREIGN KEY ("exam_lesson_id", "id") REFERENCES "app"."lessons"("id", "course_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
