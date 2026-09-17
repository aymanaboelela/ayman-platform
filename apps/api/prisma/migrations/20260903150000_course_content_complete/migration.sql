-- «خلصت الكورس» was a claim the platform had no right to make.
--
-- It was derived, everywhere, from `clearedLessons === totalLessons` — and
-- `totalLessons` counts the lectures PUBLISHED SO FAR, not the lectures the
-- course will have. So a course with one lecture up and thirty still being
-- recorded told the student who watched that one lecture that they had
-- finished the course: «لسه الوقتي هننزل محاضرات، يقول إنه خلصت الكورس؟ مش
-- منطقي».
--
-- The missing fact is not derivable from the content — only the instructor
-- knows whether the syllabus is fully uploaded — so it is stored, and it is
-- theirs to set from the course editor.
--
-- DEFAULT false, and that is the honest default: today NO course on this
-- platform has finished uploading, and a default of `true` would have shipped
-- the exact wrong claim on every existing row. A course that really is
-- complete gets the switch turned on, once.
ALTER TABLE "app"."courses"
  ADD COLUMN "content_complete" BOOLEAN NOT NULL DEFAULT false;
