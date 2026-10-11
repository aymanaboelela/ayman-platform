-- «حسّن الجودات»: المالك بيختار أنهي جودات تتعمل (٧٢٠ بس، أو ٤٨٠ و٣٦٠، أو الكل).
--
-- مصفوفة فاضية = «الكل» (كل جودة ناقصة). آمنة على التلات ستاكات وقت الـboot:
-- عمود بـDEFAULT ثابت، metadata بس، ومفيش صف موجود بيتغيّر معناه.
ALTER TABLE "app"."lesson_videos"
  ADD COLUMN "upgrade_heights" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
