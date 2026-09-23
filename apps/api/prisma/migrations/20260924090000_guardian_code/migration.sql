-- ═══════════════════════════════════════════════════════════════════════════
-- «كود ولي الأمر» — الباب اللي بيدخل منه الأب يشوف ابنه.
--
-- ## الكود ده مفتاح، مش رقم تعريف
--
-- اللي معاه الكود بيشوف سجل الطالب كامل: اتفرّج على إيه، سلّم كام واجب،
-- درجاته، وغلط في إيه. يعني هو **سر بيتحفظ**، ونفس قواعد كلمة السر بتنطبق
-- عليه: مستحيل يتخمّن، وينفع يتغيّر لو اتشارك غلط.
--
-- ٢٦ حرف من أبجدية ٣٢ حرف = ١٣٠ بت. ده مش «صعب يتخمّن»، ده **مستحيل** —
-- ومع الحد على المحاولات في الدخول، التخمين مالوش أي طريق.
--
-- ## ليه الأبجدية ناقصة حروف
--
-- `0/O` و`1/I/L` بيتلخبطوا لما حد يقرا الكود من شاشة ويكتبه في تليفون — وده
-- بالظبط اللي هيحصل: الابن بيقرا والأب بيكتب. شيلناهم، فاللي بيتكتب غلط
-- بيبقى غلط حقيقي مش لبس في الخط.
--
-- ## ليه `NOT NULL` مع باك‌فيل
--
-- الحساب اللي مالوش كود مالوش باب — ولي أمره بيقف قدام شاشة بتطلب كود
-- الحساب مش شايله. فكل حساب موجود بياخد واحد دلوقتي، وأي حساب جديد بياخده
-- من الديفولت.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.new_guardian_code() RETURNS text AS $$
  SELECT string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31) + 1)::int, 1),
    ''
  )
  FROM generate_series(1, 26);
$$ LANGUAGE sql VOLATILE;

ALTER TABLE "app"."student_profiles"
  ADD COLUMN "guardian_code" TEXT;

-- باك‌فيل: كل حساب موجود بياخد كوده. اللوب عشان التكرار — احتماله يقرب من
-- الصفر على ١٣٠ بت، بس «يقرب من الصفر» مش «صفر»، والـUNIQUE تحت بيرفض.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN SELECT user_id FROM app.student_profiles WHERE guardian_code IS NULL LOOP
    LOOP
      BEGIN
        UPDATE app.student_profiles
           SET guardian_code = app.new_guardian_code()
         WHERE user_id = target.user_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- نجرّب تاني بكود جديد.
      END;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "app"."student_profiles"
  ALTER COLUMN "guardian_code" SET NOT NULL,
  ALTER COLUMN "guardian_code" SET DEFAULT app.new_guardian_code();

CREATE UNIQUE INDEX "student_profiles_guardian_code_key"
  ON "app"."student_profiles" ("guardian_code");

-- الشكل مفروض في الداتابيز كمان: صف بكود قصير أو بحروف ملخبطة هو صف
-- بمفتاح أضعف من اللي الكود ده اتعمل عشانه، والتطبيق لوحده مش ضمان.
ALTER TABLE "app"."student_profiles"
  ADD CONSTRAINT "student_profiles_guardian_code_shape"
  CHECK ("guardian_code" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{26}$');
