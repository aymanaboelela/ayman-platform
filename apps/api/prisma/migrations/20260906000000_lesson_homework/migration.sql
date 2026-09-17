-- ═══════════════════════════════════════════════════════════════════════════
-- الواجب — الواجب اللي على المحاضرة، وصور الحل، وجروب الدفعة.
--
-- «المحاضرة دي بيكون عليها واجبات… أنا محتاج واحد اتنين تلاتة، وعشان يجاوب
--  لازم يرفع صورة أو أكتر بالحل… وأول ما أراجع عليها وأوافق، امسح الصور خالص.»
--
-- ## ثلاث جداول، مش واحد
--
-- `lesson_homework` هو السؤال (١:١ مع المحاضرة، زي `lesson_texts` بالظبط)،
-- `homework_submissions` هو إن فلان سلّم، و`homework_images` هي البايتات.
-- الفصل ده هو اللي بيخلّي «امسح الصور وسيب إنه سلّم» عملية DELETE على جدول
-- واحد بدل ما تكون أعمدة بتتفضّى في نص صف — وده بالظبط اللي المطلوب:
--
--     «بس ما تبينوش إنها اتمسحت، لأن كده مش هتبين إن هو رفع صورة.»
--
-- فالصف بيفضل، و`image_count` بيفضل بيقول كانوا كام، و`images_purged_at`
-- بيقول اتمسحوا امتى. اللي بيروح هو الصورة نفسها بس.
--
-- ## صف واحد لكل (محاضرة، طالب)
--
-- «فكّر أكتر وابعت الواجب مرة تانية» بيرجّع نفس الواجب لنفس الطالب — مش واجب
-- جديد. فالصف بيتحدّث في مكانه و`attempt` بيعدّ المحاولات، والـUNIQUE تحت هي
-- اللي بتمنع إن نفس التمرين يتعدّ مرتين في أي إحصائية.
--
-- ## `whatsapp_group_url` على الكورس
--
-- «كل كورس ده هيكون ليه جروب واتساب مخصص… غير الجروب الأساسي الكبير الرسمي.»
-- الجروب الرسمي عايش في `site_settings` وبيتعرض لأي حد؛ ده جروب الدفعة نفسها
-- وبيتعرض للطالب المشترك بس. الـCHECK بتفرض `https:` — لينك في anchor بيتعرض
-- لطلبة هو الخطر الوحيد اللي العمود ده شايله.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."homework_status" AS ENUM ('submitted', 'accepted', 'needs_work');

-- ── جروب الدفعة ────────────────────────────────────────────────────────────

ALTER TABLE "app"."courses" ADD COLUMN "whatsapp_group_url" TEXT;

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_whatsapp_group_url_https"
  CHECK ("whatsapp_group_url" IS NULL OR "whatsapp_group_url" LIKE 'https://%');

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_whatsapp_group_url_length"
  CHECK ("whatsapp_group_url" IS NULL OR char_length("whatsapp_group_url") BETWEEN 12 AND 500);

-- ── السؤال ─────────────────────────────────────────────────────────────────

CREATE TABLE "app"."lesson_homework" (
    "lesson_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "max_images" INTEGER NOT NULL DEFAULT 4,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_homework_pkey" PRIMARY KEY ("lesson_id")
);

ALTER TABLE "app"."lesson_homework"
    ADD CONSTRAINT "lesson_homework_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- سقف الصور. حدّ أعلى بيتعرض للطالب، مش هدف — من غيره الحل الواحد ممكن يبقى
-- أربعين صورة لنفس الصفحة، والصور هي الحتة الغالية في الميزة دي كلها.
ALTER TABLE "app"."lesson_homework"
  ADD CONSTRAINT "lesson_homework_max_images_range"
  CHECK ("max_images" BETWEEN 1 AND 8);

-- واجب من غير سؤال مالوش معنى، وواجب بمقال مالوش معنى تاني: الطالب بيقراه على
-- تليفون قبل ما يمسك الورقة.
ALTER TABLE "app"."lesson_homework"
  ADD CONSTRAINT "lesson_homework_body_length"
  CHECK (char_length(btrim("body")) BETWEEN 3 AND 4000);

-- ── التسليم ────────────────────────────────────────────────────────────────

CREATE TABLE "app"."homework_submissions" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" UUID NOT NULL,
    "status" "app"."homework_status" NOT NULL DEFAULT 'submitted',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "image_count" INTEGER NOT NULL DEFAULT 0,
    "grade" DECIMAL(5,2),
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "images_purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "homework_submissions_lesson_id_user_id_key"
  ON "app"."homework_submissions" ("lesson_id", "user_id");

CREATE INDEX "homework_submissions_status_submitted_at_idx"
  ON "app"."homework_submissions" ("status", "submitted_at" DESC);

CREATE INDEX "homework_submissions_course_id_status_submitted_at_idx"
  ON "app"."homework_submissions" ("course_id", "status", "submitted_at" DESC);

CREATE INDEX "homework_submissions_submitted_at_idx"
  ON "app"."homework_submissions" ("submitted_at");

CREATE INDEX "homework_submissions_user_id_submitted_at_idx"
  ON "app"."homework_submissions" ("user_id", "submitted_at" DESC);

ALTER TABLE "app"."homework_submissions"
    ADD CONSTRAINT "homework_submissions_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "app"."lessons"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE على الطالب — عكس `payment_submissions`. مفيش فلوس ولا سجل محاسبي
-- هنا، الصف ده صورة كراسة واحد بعينه، وده بالظبط اللي حذف الحساب المفروض
-- ياخده معاه.
ALTER TABLE "app"."homework_submissions"
    ADD CONSTRAINT "homework_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL على المصحّح: التسليم سجل لحاجة الطالب عملها، ولازم يعيش بعد حساب
-- الأدمن اللي صحّحه. نفس تقسيمة `payment_submissions_reviewed_by`.
ALTER TABLE "app"."homework_submissions"
    ADD CONSTRAINT "homework_submissions_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- الدرجة من ١٠٠. NULL معناها «مقبول من غير درجة» وهي الحالة الطبيعية لتمرين
-- سريع؛ رقم بره النطاق ده غلط كتابة مش تقدير.
ALTER TABLE "app"."homework_submissions"
  ADD CONSTRAINT "homework_submissions_grade_range"
  CHECK ("grade" IS NULL OR ("grade" >= 0 AND "grade" <= 100));

-- الدرجة والمراجعة بيتحرّكوا مع بعض: درجة على تسليم لسه محدش بصّ له معناها
-- إن في مسار بيكتب نص قرار.
ALTER TABLE "app"."homework_submissions"
  ADD CONSTRAINT "homework_submissions_grade_needs_review"
  CHECK ("grade" IS NULL OR "reviewed_at" IS NOT NULL);

ALTER TABLE "app"."homework_submissions"
  ADD CONSTRAINT "homework_submissions_attempt_positive"
  CHECK ("attempt" >= 1);

ALTER TABLE "app"."homework_submissions"
  ADD CONSTRAINT "homework_submissions_image_count_range"
  CHECK ("image_count" BETWEEN 0 AND 8);

-- ── الصور ──────────────────────────────────────────────────────────────────

CREATE TABLE "app"."homework_images" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "homework_images_submission_id_position_idx"
  ON "app"."homework_images" ("submission_id", "position");

ALTER TABLE "app"."homework_images"
    ADD CONSTRAINT "homework_images_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "app"."homework_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- البادئة `hw/` بثلاث مقاطع — عشان `GET /media/:prefix/:name` (اللي بياخد
-- مقطعين بالظبط) ما يقدرش يوصّلها أصلاً. نفس الحيلة بتاعة `doc/` و`msg/`،
-- والـCHECK هنا عشان كتابة SQL مباشرة ما تقدرش تدخّل مفتاح بشكل تاني.
ALTER TABLE "app"."homework_images"
  ADD CONSTRAINT "homework_images_key_shape"
  CHECK ("storage_key" ~ '^hw/[0-9a-f]{2}/[0-9a-f-]{36}\.webp$');

ALTER TABLE "app"."homework_images"
  ADD CONSTRAINT "homework_images_size_positive"
  CHECK ("size_bytes" > 0);
