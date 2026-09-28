-- «اظهر رقم الطالب على الفيديو» — per course.
--
-- An uploaded lecture carries the student's name over the picture, so a
-- screen recording names the account it came from. The phone number with it
-- is the instructor's call, course by course, and it starts OFF: the owner's
-- words were «الرقم ده شيله، أو خليه من إعدادات الكورس».
--
-- Additive, with a default, so every existing course keeps playing exactly as
-- before on every stack the moment this runs.
ALTER TABLE "app"."courses"
  ADD COLUMN "watermark_phone" BOOLEAN NOT NULL DEFAULT false;
