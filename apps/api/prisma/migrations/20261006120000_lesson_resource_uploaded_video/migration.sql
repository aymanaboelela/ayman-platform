-- «رفع فيديو» جوّه مواد الدرس — بنفس pipeline فيديو المحاضرة الأساسي.
--
-- ⚠️ ليه الميجريشن دي موجودة أصلًا: #580 ضاف فرع «فيديو مرفوع» في الـDTO بيكتب
-- `storage_key`/`filename`/`mime`/`size_bytes` على صف `kind = 'video'`، والقيد
-- `lesson_resources_payload_matches_kind` بيقول العكس بالظبط لنوع الفيديو. فكل
-- رفع — بأي حجم — كان بيقع بـ CHECK violation، والأدمن يشوف «مقدرناش نضيف المادة
-- دي». يعني مفيش ولا صف بالشكل ده في أي داتابيز من التلاتة، ومفيش حاجة تتنقل.
--
-- الشكل الجديد: صف `kind = 'video'` و`video_provider = 'upload'`،
-- و`video_external_id` هو رقم الرفع (٣٢ hex) — نفس المفتاح اللي الفيديو الأساسي
-- بيتخزن بيه تحت `v/<id>/` على R2. وحالة الـpipeline على الصف نفسه بنفس أسماء
-- أعمدة `lesson_videos`، عشان العامل (`VideoMirrorService`) يكتب نفس الداتا في
-- الجدولين من غير ترجمة.
--
-- آمنة على التلات ستاكات وقت الـboot: أعمدة nullable أو بـDEFAULT ثابت (metadata
-- بس، مفيش إعادة كتابة للجدول)، والقيود الجديدة كل الصفوف الموجودة بتعدّيها —
-- كلها يوتيوب بـ١١ حرف أو مش فيديو أصلًا.

ALTER TABLE "app"."lesson_resources"
  ADD COLUMN "mirror_status"    "app"."VideoMirrorStatus",
  ADD COLUMN "mirror_progress"  INTEGER,
  ADD COLUMN "mirror_height"    INTEGER,
  ADD COLUMN "mirror_bytes"     BIGINT,
  ADD COLUMN "mirror_error"     TEXT,
  ADD COLUMN "mirror_attempts"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mirror_at"        TIMESTAMP(3),
  ADD COLUMN "source_name"      TEXT,
  ADD COLUMN "source_bytes"     BIGINT,
  ADD COLUMN "duration_seconds" INTEGER;

-- `lesson_resources_payload_matches_kind` مش محتاج يتلمس: فرع الفيديو فيه
-- بيطلب `video_provider` و`video_external_id` ومن غير ملف ولا رابط — وده
-- بالظبط شكل الصف المرفوع. اللي كان بيمنعه فعلًا هو قيد الـ١١ حرف تحت.

-- قاعدة الـ١١ حرف فضلت ليوتيوب بالظبط؛ الرفع رقمه ٣٢ hex صغيرة — نفس
-- `UPLOAD_ID_RE` في `@ayman/contracts/video`، وهو اللي بيتبني منه مفتاح R2،
-- فقيمة تانية هنا كانت هتبقى مسار في الباكت محدش كتبه.
ALTER TABLE "app"."lesson_resources" DROP CONSTRAINT "lesson_resources_video_id_is_11_chars";
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_video_id_shape" CHECK (
    "video_external_id" IS NULL
    OR ("video_provider" = 'upload' AND "video_external_id" ~ '^[0-9a-f]{32}$')
    OR ("video_provider" <> 'upload' AND "video_external_id" ~ '^[A-Za-z0-9_-]{11}$')
  );

-- حالة الـpipeline موجودة لو — وبس لو — الفيديو مرفوع. صف يوتيوب بحالة كان
-- هيتسحب في طابور العامل؛ وصف مرفوع من غير حالة كان هيفضل مستخبي عن الطابور
-- للأبد. `IS NOT DISTINCT FROM` عشان `NULL = 'upload'` بيطلع NULL، والـCHECK
-- بيعدّي NULL.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_upload_has_state" CHECK (
    ("video_provider" IS NOT DISTINCT FROM 'upload') = ("mirror_status" IS NOT NULL)
  );

-- نفس `lesson_videos_mirror_height_ck`: `ready` من غير ارتفاع معناه مشغّل
-- بيطلب playlist مش موجودة.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_mirror_height_ck" CHECK (
    "mirror_status" IS DISTINCT FROM 'ready' OR "mirror_height" IS NOT NULL
  );

-- استعلام العامل: الحالة + العمر. نفس `lesson_videos_mirror_idx`.
CREATE INDEX "lesson_resources_mirror_status_mirror_at_idx"
  ON "app"."lesson_resources" ("mirror_status", "mirror_at");
