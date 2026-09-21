-- `access_grants_scope_target` (آخر مرة اتكتب في
-- 20260828000001_access_grants_term_scope_check) ما كانش يعرف حاجة عن سكوب
-- `course_month` اللي الميجريشن اللي قبل دي ضافته. لازم يبقى ملف لوحده
-- بيشتغل بعد ما دي تعمل commit: بوستجرس بيرفض تستخدم قيمة enum لسه متضافة
-- (حتى جوّه CHECK، اللي بيتحقق منه على الصفوف الموجودة على طول) في نفس
-- الترانزاكشن اللي ضافتها.
ALTER TABLE "app"."access_grants" DROP CONSTRAINT "access_grants_scope_target";

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_scope_target" CHECK (
       ("scope" = 'platform'        AND "course_id" IS NULL     AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL)
    OR ("scope" = 'course'          AND "course_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL)
    OR ("scope" = 'subject_teacher' AND "subject_id" IS NOT NULL AND "course_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL)
    OR ("scope" = 'unassigned'      AND "course_id" IS NULL     AND "subject_id" IS NULL AND "term_id" IS NULL AND "month_id" IS NULL)
    OR ("scope" = 'term'            AND "course_id" IS NOT NULL AND "term_id" IS NOT NULL AND "subject_id" IS NULL AND "month_id" IS NULL)
    -- مدنورمل زي `term` بالظبط: `course_id` محمول جنب `month_id` (مش
    -- مستنتج منه) عشان فلتر `courseId` العادي — قايمة السكوبات في
    -- `EntitlementService.resolveCourseAccess` — يلاقي كل grant شهر على
    -- الكورس من غير join.
    OR ("scope" = 'course_month'    AND "course_id" IS NOT NULL AND "month_id" IS NOT NULL AND "subject_id" IS NULL AND "term_id" IS NULL)
  );

-- اشتراك الشهر مالوش تاريخ انتهاء، بالظبط زي `scope: term`. اللي دفع «شهر ٢»
-- اشترى محتوى شهر ٢، مش ٣٠ يوم — وده بالتحديد الفرق اللي الفيتشر دي موجودة
-- عشانه. القطع الوحيد هو `revoked_at`.
--
-- ⚠️ الـCHECK ده بيخلّي `FinanceService.editDates` يرمي 23514 لو حد حاول
-- يحط تاريخ على grant شهر من شاشة الفلوس. الحارس هناك اتوسّع يغطّي السكوب ده
-- كمان — لو رجعت شيلته، الشاشة بتقع بـ500 مش برسالة.
ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_month_open_ended"
  CHECK ("scope" <> 'course_month' OR "valid_until" IS NULL);
