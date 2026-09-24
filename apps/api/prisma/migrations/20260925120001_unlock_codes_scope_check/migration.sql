-- `access_grants_scope_target` (آخر مرة اتكتب في
-- 20260921120001_access_grants_month_scope_check) ما يعرفش السكوبين الجداد
-- `section` و`lesson` ولا العمودين بتوعهم. ملف لوحده لنفس السبب اللي هناك:
-- بوستجرس بيرفض يستخدم قيمة enum لسه متضافة في نفس الترانزاكشن.
--
-- كل سكوب قديم بقى كمان لازم `section_id` و`lesson_id` يبقوا فاضيين — عشان
-- جرانت `course` مثلًا مايبقاش شايل محاضرة بالغلط ويتقري بطريقتين.
ALTER TABLE "app"."access_grants" DROP CONSTRAINT "access_grants_scope_target";

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_scope_target" CHECK (
       ("scope" = 'platform'        AND "course_id" IS NULL     AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("scope" = 'course'          AND "course_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("scope" = 'subject_teacher' AND "subject_id" IS NOT NULL AND "course_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("scope" = 'unassigned'      AND "course_id" IS NULL     AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("scope" = 'term'            AND "course_id" IS NOT NULL AND "term_id" IS NOT NULL AND "subject_id" IS NULL AND "month_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("scope" = 'course_month'    AND "course_id" IS NOT NULL AND "month_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    -- مدنورملين زي `term` بالظبط: `course_id` محمول جنب الهدف عشان فلتر
    -- `courseId` العادي يلاقيهم من غير join.
    OR ("scope" = 'section'         AND "course_id" IS NOT NULL AND "section_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL AND "lesson_id" IS NULL)
    OR ("scope" = 'lesson'          AND "course_id" IS NOT NULL AND "lesson_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL AND "section_id" IS NULL)
  );

-- وحدة أو محاضرة اتشترت بكود مالهاش تاريخ انتهاء، زي الشهر بالظبط: القطع
-- الوحيد هو `revoked_at` لما الأدمن يسحب الكود.
ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_content_open_ended"
  CHECK ("scope" NOT IN ('section', 'lesson') OR "valid_until" IS NULL);
