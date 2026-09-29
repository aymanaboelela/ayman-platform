-- «اسم الطالب على الفيديو» — per course, and ON unless the teacher turns it off.
--
-- The moving name over a lecture was always drawn; the owner asked for the
-- choice: «عاوز أوقفها… أقدر أوقفها أو أشغّلها من الكورس». The phone beside it
-- already had its own switch (`watermark_phone`).
--
-- Additive, DEFAULT true: every existing course keeps showing the name exactly
-- as it does now, on every stack, the moment this runs.
ALTER TABLE "app"."courses"
  ADD COLUMN "watermark_name" BOOLEAN NOT NULL DEFAULT true;
