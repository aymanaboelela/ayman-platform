-- «حسّن الجودات»: فيديو اتنشر من غير معالجة ليه جودة واحدة، والمالك بيدوس زرار
-- بالليل فالعامل يبني الباقي من الجودة اللي على R2.
--
-- `ladder_rev` هو اللي بيخلّي ده يوصل للطالب: ملف الجودات (master.m3u8) متكاشّى
-- سنة في المتصفحات وعلى الإيدج، فالرابط لازم يتغيّر لما الملف يتكتب من جديد.
--
-- آمنة على التلات ستاكات وقت الـboot: أعمدة nullable أو بـDEFAULT ثابت (metadata
-- بس، مفيش إعادة كتابة للجدول)، ومفيش صف موجود بيتغيّر معناه.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "upgrade_status"   TEXT,
  ADD COLUMN "upgrade_progress" INTEGER,
  ADD COLUMN "upgrade_error"    TEXT,
  ADD COLUMN "upgrade_at"       TIMESTAMP(3),
  ADD COLUMN "ladder_rev"       INTEGER NOT NULL DEFAULT 1;
