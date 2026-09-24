-- ═══════════════════════════════════════════════════════════════════════════
-- «أكواد الفتح» — الأدمن بيعمل كود من ست حروف وأرقام لكورس واحد، ويختار الكود
-- ده يفتح إيه: الكورس كله، ترم، شهر، وحدة، أو محاضرة (بالكويز والواجب
-- بتوعها). أول طالب يكتب الكود بيتفتحله اللي فيه، والكود بعدها خلص.
--
-- ## الكود مش بيفتح حاجة بنفسه
--
-- لما الطالب يكتبه، كل حتة فيه بتتحول لـ`access_grants` عادي بـ`source:
-- access_code` و`unlock_code_id` متعلّم. الكورس كله = `scope: course`، الترم
-- = `term`، الشهر = `course_month` — نفس السكوبات اللي الدفع بيكتبها، فكل حاجة
-- بتقرا الجرانتات النهارده بتفهمها من غير تعديل.
--
-- الجديد سكوبين بس: `section` (وحدة) و`lesson` (محاضرة). وهمّا **برّه**
-- `courseAccessScopes` عن قصد: دول مش اشتراك في الكورس، وكل عدّاد وشاشة فلوس
-- بتقرا الدالة دي لازم تفضل مش شايفاهم. بوابة المحاضرة بتقراهم من
-- `EntitlementService.resolveContentAccess`.
--
-- ## مرة واحدة بس — من بوستجرس مش من الكود
--
-- `redeem` عبارة عن UPDATE واحد مشروط (`redeemed_at IS NULL AND revoked_at IS
-- NULL`). طالبين بيكتبوا نفس الكود في نفس اللحظة: بوستجرس بيدّي الصف لواحد
-- بس، والتاني بيلاقي صفر صفوف.
--
-- ## ليه ملفين
--
-- `ALTER TYPE ... ADD VALUE` مايتستخدمش في نفس الترانزاكشن اللي ضافته — ولا
-- حتى جوّه CHECK. فالـCHECK الجديد على `access_grants` في
-- `20260925120001_unlock_codes_scope_check`، بعد ما ده يعمل commit. نفس شكل
-- `20260921120000_curriculum_months` بالظبط.
--
-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES FOR ROLE
-- اللي بيغطّي أي جدول جديد.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."access_scope" ADD VALUE IF NOT EXISTS 'section';
ALTER TYPE "app"."access_scope" ADD VALUE IF NOT EXISTS 'lesson';

CREATE TYPE "app"."unlock_item_kind" AS ENUM ('term', 'month', 'section', 'lesson');

CREATE TABLE "app"."unlock_codes" (
  "id"                  UUID NOT NULL,
  "code"                VARCHAR(6) NOT NULL,
  "course_id"           UUID NOT NULL,
  "whole_course"        BOOLEAN NOT NULL DEFAULT false,
  "price_cents"         INTEGER,
  "note"                TEXT,
  "created_by_user_id"  TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemed_by_user_id" TEXT,
  "redeemed_at"         TIMESTAMP(3),
  "revoked_at"          TIMESTAMP(3),
  "revoked_by_user_id"  TEXT,
  CONSTRAINT "unlock_codes_pkey" PRIMARY KEY ("id"),
  -- نفس أبجدية كود ولي الأمر: من غير 0/O/1/I/L، لأن الطالب بيقرا الكود من
  -- رسالة واتساب وبيكتبه بإيده.
  CONSTRAINT "unlock_codes_code_shape" CHECK ("code" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  CONSTRAINT "unlock_codes_price_non_negative" CHECK ("price_cents" IS NULL OR "price_cents" >= 0),
  -- طالب من غير وقت صف مايتفهمش. العكس (وقت من غير طالب) حالة حقيقية: الطالب
  -- اتمسح والـFK عمل SET NULL، والكود لسه مستخدم.
  CONSTRAINT "unlock_codes_redeemed_pair" CHECK ("redeemed_by_user_id" IS NULL OR "redeemed_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "unlock_codes_code_key" ON "app"."unlock_codes"("code");
CREATE INDEX "unlock_codes_course_id_created_at_idx" ON "app"."unlock_codes"("course_id", "created_at");
CREATE INDEX "unlock_codes_created_at_idx" ON "app"."unlock_codes"("created_at");
CREATE INDEX "unlock_codes_redeemed_by_user_id_idx" ON "app"."unlock_codes"("redeemed_by_user_id");

ALTER TABLE "app"."unlock_codes" ADD CONSTRAINT "unlock_codes_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_codes" ADD CONSTRAINT "unlock_codes_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_codes" ADD CONSTRAINT "unlock_codes_redeemed_by_user_id_fkey"
  FOREIGN KEY ("redeemed_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_codes" ADD CONSTRAINT "unlock_codes_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."unlock_code_items" (
  "id"         UUID NOT NULL,
  "code_id"    UUID NOT NULL,
  "kind"       "app"."unlock_item_kind" NOT NULL,
  "term_id"    UUID,
  "month_id"   UUID,
  "section_id" UUID,
  "lesson_id"  UUID,
  CONSTRAINT "unlock_code_items_pkey" PRIMARY KEY ("id"),
  -- العمود اللي `kind` بيسمّيه هو بس اللي متملّي.
  CONSTRAINT "unlock_code_items_kind_target" CHECK (
       ("kind" = 'term'    AND "term_id" IS NOT NULL    AND "month_id" IS NULL AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("kind" = 'month'   AND "month_id" IS NOT NULL   AND "term_id" IS NULL  AND "section_id" IS NULL AND "lesson_id" IS NULL)
    OR ("kind" = 'section' AND "section_id" IS NOT NULL AND "term_id" IS NULL  AND "month_id" IS NULL   AND "lesson_id" IS NULL)
    OR ("kind" = 'lesson'  AND "lesson_id" IS NOT NULL  AND "term_id" IS NULL  AND "month_id" IS NULL   AND "section_id" IS NULL)
  )
);

CREATE INDEX "unlock_code_items_code_id_idx" ON "app"."unlock_code_items"("code_id");

ALTER TABLE "app"."unlock_code_items" ADD CONSTRAINT "unlock_code_items_code_id_fkey"
  FOREIGN KEY ("code_id") REFERENCES "app"."unlock_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_code_items" ADD CONSTRAINT "unlock_code_items_term_id_fkey"
  FOREIGN KEY ("term_id") REFERENCES "app"."course_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_code_items" ADD CONSTRAINT "unlock_code_items_month_id_fkey"
  FOREIGN KEY ("month_id") REFERENCES "app"."course_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_code_items" ADD CONSTRAINT "unlock_code_items_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "app"."course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."unlock_code_items" ADD CONSTRAINT "unlock_code_items_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- الجرانت بيشاور على الوحدة/المحاضرة اللي فتحها، وعلى الكود اللي فتحه.
ALTER TABLE "app"."access_grants"
  ADD COLUMN "section_id"     UUID,
  ADD COLUMN "lesson_id"      UUID,
  ADD COLUMN "unlock_code_id" UUID;

CREATE INDEX "access_grants_user_id_course_id_scope_idx" ON "app"."access_grants"("user_id", "course_id", "scope");
CREATE INDEX "access_grants_unlock_code_id_idx" ON "app"."access_grants"("unlock_code_id");

ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "app"."course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL مش CASCADE: الكود مابيتمسحش لو اتستخدم (السحب = `revoked_at`)،
-- بس لو الكورس نفسه اتمسح الكود بيروح معاه، والجرانت بيروح مع الكورس أصلًا.
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_unlock_code_id_fkey"
  FOREIGN KEY ("unlock_code_id") REFERENCES "app"."unlock_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
