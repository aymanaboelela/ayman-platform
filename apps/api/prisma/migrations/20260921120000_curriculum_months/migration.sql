-- ═══════════════════════════════════════════════════════════════════════════
-- «شهر المنهج» — الاشتراك الشهري بقى شهر من المنهج، مش ٣٠ يوم من تاريخ الدفع.
--
-- الاشتراك الشهري لحد النهارده كان نافذة متحركة: `access_grants.valid_until =
-- now + شهر`، وطول ما هي حية الطالب بيشوف كل محاضرة منشورة في الكورس. يعني
-- اللي دفع في نص الشهر فتح الأرشيف كله، وكمان كل اللي هينزل في الـ٣٠ يوم
-- الجايين. اللي المدرّس عايزه: «شهر ١» = المحاضرات دي بعينها، والطالب يختار
-- الشهر اللي هو عايزه.
--
-- ── ليه مش CourseTerm ─────────────────────────────────────────────────────
-- الترم بيجمّع SECTIONS (`course_sections.term_id`)، والشهر بيجمّع LESSONS،
-- والاتنين لازم يقدروا يختلفوا: «الترم الأول» لازم يفضل مغطّي كل شهر جوّاه،
-- والسكشن ليه `term_id` واحد بس — فلو الشهر كان ترم، المحاضرة ما كانتش تقدر
-- تبقى في «الترم الأول» و«شهر ٣» في نفس الوقت.
--
-- وفيه سبب تاني أهم: `TermService.setOpen` لما بيقفل ترم بيختم `revoked_at`
-- على كل grant حي بتاعه، والختم ده دائم (اقرا موديل `CourseTerm`). المدرّس
-- هيقفل شهر ويفتح تاني ٩ مرات في السنة — نفس الزرار كان هيمسح كوهورت كاملة.
--
-- ── ⚠️ prisma migrate dev هيحاول يلغي حاجتين هنا ─────────────────────────
-- ١. هيقترح DROP CONSTRAINT على `lesson_months_lesson_in_course` و
--    `lesson_months_month_in_course` و`payment_submission_months_*_in_course`
--    — composite FKs مابيشوفهاش، بالظبط زي `lessons_section_matches_course`
--    و`exam_coverage_*_in_course`.
-- ٢. هيقترح يشيل الـunique indexes اللي بتسندهم:
--    `course_months_id_course_key` و`payment_submissions_id_course_key`.
-- عمرك ما توافق. بعد أي migrate اتأكد بـ:
--   psql -tAc "SELECT conname FROM pg_constraint
--              WHERE conrelid = 'app.lesson_months'::regclass ORDER BY 1;"
--
-- قيمة الـenum `course_month` بتتضاف هنا وبتتستخدم في الميجريشن اللي بعدها —
-- بوستجرس بيرفض تستخدم قيمة enum جديدة (حتى جوّه CHECK) في نفس الترانزاكشن
-- اللي ضافتها. نفس السبب الحرفي اللي خلّى
-- `20260828000001_access_grants_term_scope_check` ملف لوحده.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── الشهر نفسه ────────────────────────────────────────────────────────────
CREATE TABLE "app"."course_months" (
  "id"           UUID NOT NULL,
  "course_id"    UUID NOT NULL,
  "month_index"  INT  NOT NULL,
  "title"        TEXT NOT NULL,
  "is_open"      BOOLEAN NOT NULL DEFAULT true,
  "price_cents"  INT,
  "starts_on"    DATE,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_months_pkey" PRIMARY KEY ("id")
);

-- ١..١٢ مش ١..٩. السنة الدراسية تسع شهور، بس شهر مراجعة أو شهر صيفي حاجة
-- هيطلبها، وتوسيع CHECK بعدين ميجريشن على جدول شغّال.
ALTER TABLE "app"."course_months"
  ADD CONSTRAINT "course_months_index_range"
  CHECK ("month_index" BETWEEN 1 AND 12);

ALTER TABLE "app"."course_months"
  ADD CONSTRAINT "course_months_price_non_negative"
  CHECK ("price_cents" IS NULL OR "price_cents" >= 0);

ALTER TABLE "app"."course_months"
  ADD CONSTRAINT "course_months_title_not_blank"
  CHECK (length(btrim("title")) > 0);

CREATE UNIQUE INDEX "course_months_course_id_month_index_key"
  ON "app"."course_months" ("course_id", "month_index");

-- بيسند الـcomposite FKs تحت — نفس حيلة `lessons_id_course_key`.
CREATE UNIQUE INDEX "course_months_id_course_key"
  ON "app"."course_months" ("id", "course_id");

ALTER TABLE "app"."course_months"
  ADD CONSTRAINT "course_months_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── المحاضرة ↔ الشهر ─────────────────────────────────────────────────────
-- `is_primary` هو «الشهر بتاع المحاضرة دي» اللي بيظهر في فورم المحاضرة؛ باقي
-- الصفوف هي «اداها كمان لشهر ٢ و٣».
CREATE TABLE "app"."lesson_months" (
  "lesson_id"  UUID NOT NULL,
  "month_id"   UUID NOT NULL,
  "course_id"  UUID NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "lesson_months_pkey" PRIMARY KEY ("lesson_id", "month_id")
);

-- شهر أساسي واحد للمحاضرة. partial unique مش CHECK، لأن القيد عبر الصفوف.
CREATE UNIQUE INDEX "lesson_months_one_primary"
  ON "app"."lesson_months" ("lesson_id") WHERE "is_primary";

CREATE INDEX "lesson_months_month_id_idx"
  ON "app"."lesson_months" ("month_id");

ALTER TABLE "app"."lesson_months"
  ADD CONSTRAINT "lesson_months_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."lesson_months"
  ADD CONSTRAINT "lesson_months_month_id_fkey"
  FOREIGN KEY ("month_id") REFERENCES "app"."course_months"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- الاتنين اللي بيهمّوا: الطرفين في نفس الكورس، قيد في الداتابيز مش `if` في
-- سيرفس. محاضرة من كورس تاني في شهر الكورس ده كانت هتبقى تسريب وصول صامت.
ALTER TABLE "app"."lesson_months"
  ADD CONSTRAINT "lesson_months_lesson_in_course"
  FOREIGN KEY ("lesson_id", "course_id")
  REFERENCES "app"."lessons"("id", "course_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."lesson_months"
  ADD CONSTRAINT "lesson_months_month_in_course"
  FOREIGN KEY ("month_id", "course_id")
  REFERENCES "app"."course_months"("id", "course_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── الطلب ↔ الشهور (تحويل واحد يشتري كذا شهر) ────────────────────────────
-- جدول ربط، مش عمود UUID[]. الفرق إن الـarray مالهاش FK: صف فلوس بيشاور على
-- شهر اتمسح، أو على شهر من كورس تاني، ما كانش حد هيوقفه. و`payment_submissions
-- .term_id` نفسه FK حقيقي — ده نفس المستوى.
CREATE UNIQUE INDEX "payment_submissions_id_course_key"
  ON "app"."payment_submissions" ("id", "course_id");

CREATE TABLE "app"."payment_submission_months" (
  "submission_id" UUID NOT NULL,
  "month_id"      UUID NOT NULL,
  "course_id"     UUID NOT NULL,
  CONSTRAINT "payment_submission_months_pkey" PRIMARY KEY ("submission_id", "month_id")
);

CREATE INDEX "payment_submission_months_month_id_idx"
  ON "app"."payment_submission_months" ("month_id");

ALTER TABLE "app"."payment_submission_months"
  ADD CONSTRAINT "payment_submission_months_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "app"."payment_submissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT مش CASCADE: الشهر ما يتمسحش وتحته صف فلوس. سجل الدفع append-only،
-- ومسح الشهر لازم يفضل ممنوع طول ما حد دفع فيه — `CourseMonthService.remove`
-- بيرد ٤٠٩ قبل ما نوصل هنا، وده الحزام التاني.
ALTER TABLE "app"."payment_submission_months"
  ADD CONSTRAINT "payment_submission_months_month_id_fkey"
  FOREIGN KEY ("month_id") REFERENCES "app"."course_months"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."payment_submission_months"
  ADD CONSTRAINT "payment_submission_months_submission_in_course"
  FOREIGN KEY ("submission_id", "course_id")
  REFERENCES "app"."payment_submissions"("id", "course_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."payment_submission_months"
  ADD CONSTRAINT "payment_submission_months_month_in_course"
  FOREIGN KEY ("month_id", "course_id")
  REFERENCES "app"."course_months"("id", "course_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── الـgrant ─────────────────────────────────────────────────────────────
-- مفصول عن `term_id` عمود لوحده: grant واحد يبقى شهر أو ترم، مش الاتنين،
-- والـCHECK في الميجريشن اللي بعدها هو اللي بيقول كده.
ALTER TABLE "app"."access_grants" ADD COLUMN "month_id" UUID;

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_month_id_fkey"
  FOREIGN KEY ("month_id") REFERENCES "app"."course_months"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- استعلام «كل grant حي على الشهر ده» — نفس سبب `access_grants_term_id_idx`.
CREATE INDEX "access_grants_month_id_idx" ON "app"."access_grants" ("month_id");

ALTER TYPE "app"."access_scope" ADD VALUE 'course_month';

-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES FOR ROLE
-- على سكيما `app`، فـ`ayman_runtime` واخد صلاحياته على أي جدول بيتعمل هنا.
