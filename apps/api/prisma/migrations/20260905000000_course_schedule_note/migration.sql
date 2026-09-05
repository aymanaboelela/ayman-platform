-- ═══════════════════════════════════════════════════════════════════════════
-- «مواعيد المحاضرات» — الطالب يعرف امتى المحاضرة، من غير ما يسأل.
--
-- «هضيف السبت الساعة تمانية، تمام؟ تبقى موجودة. طيب لو لغات، فيبقى يوم الحد
--  الساعة تمانية.»
--
-- ## Free text, not a day + a time
--
-- The obvious model is `weekday SMALLINT` + `time TIME` and a formatter. It is
-- the wrong one here, and the giveaway is in the example: the two courses have
-- two different days, and the person typing them is the person who teaches
-- them. A structured pair buys sorting and localisation that nothing on this
-- platform asks for, and it cannot express any of the things a real timetable
-- turns out to be — «السبت والتلات ٨ م», «٨ م بتوقيت مصر», «الأسبوع ده استثناءً
-- الأحد». Every one of those is a sentence the teacher would otherwise have to
-- phone about.
--
-- The cost of free text is that nothing can reason about it: no reminder can be
-- scheduled from this column, no «المحاضرة بعد ساعة» notification. That is a
-- real limit and it is the right trade TODAY — the ask is to display a line the
-- student can read, and a wrong-but-parseable time is worse than a right
-- sentence. If reminders are ever wanted, they need their own column and this
-- one stays as the label.
--
-- ## Why on `courses` and not on the site settings
--
-- «في كل كورس أقدر إن أنا أضيف.» عربي and لغات are two separate courses with
-- two different nights, and a student is enrolled in one of them. One global
-- setting would print both to everybody, which is exactly the confusion the
-- line exists to remove.
--
-- ## 120 characters
--
-- It renders as ONE line in the dashboard's hero band, next to the greeting, on
-- a phone. Anything longer wraps to three lines and pushes the student's own
-- progress off the first screen — so the ceiling is a layout constraint, not a
-- guess about content. NULL means «مفيش ميعاد معلن», which is every course
-- until somebody writes one, and the band simply renders nothing.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."courses"
  ADD COLUMN "schedule_note" TEXT;

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_schedule_note_length"
  CHECK ("schedule_note" IS NULL OR char_length("schedule_note") <= 120);
