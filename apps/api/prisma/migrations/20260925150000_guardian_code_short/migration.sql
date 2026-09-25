-- ═══════════════════════════════════════════════════════════════════════════
-- كود ولي الأمر بقى ٦ خانات: حروف وأرقام ورموز — «صغّره شوية، راندم، واوعى
-- يتكرر». الـ٢٦ حرف كان أمان زيادة عن اللزوم على حساب أب بيكتبه في تليفون.
--
-- ## الأبجدية
--
-- حروف `ABCDEFGHJKMNPQRSTUVWXYZ` (من غير I/L/O) + أرقام `23456789` (من غير
-- 0/1) + رموز `@#$%&*+=?` — ٤٠ خانة. وكل كود فيه حرف ورقم ورمز على الأقل،
-- عشان يبان «كود» مش كلمة.
--
-- ## العشوائية من `gen_random_uuid()` مش `random()`
--
-- ٦ خانات قصيرة كفاية إن العشوائية نفسها تفرق: `random()` مولّد عادي، وأي حد
-- يعرف كام كود ممكن يتوقع اللي بعدهم. `gen_random_uuid()` بياخد من
-- `pg_strong_random`. الـ١٦ بت اللي بناخدهم من كل UUID بعيد عن بايتات الـversion
-- والـvariant.
--
-- ## «واوعى يتكرر»
--
-- الدالة بتلف لحد ما تلاقي كود محدش واخده، والـUNIQUE INDEX اللي موجود من
-- ٢٠٢٦٠٩٢٤٠٩٠٠٠٠_guardian_code بيمسك أي سباق بين إدخالين في نفس اللحظة.
--
-- ## الأكواد القديمة بتتغير
--
-- كل كود ٢٦ حرف بيتبدّل بكود جديد صف صف (كل UPDATE جملة لوحدها، فالدالة
-- بتشوف اللي اتكتب قبلها). الفيتشر عمرها يوم، فأي أب اتبعتله كود قديم هياخد
-- الجديد من كارت الطالب.
--
-- ⚠️ الأمان: ٤٠^٦ ≈ ٤ مليار. اللي شايل التخمين هو قفل المحاولات بالـIP في
-- `GuardianSessionService` (٥ غلطات ← دقيقة ← ٥ ← ١٥ ← ساعة)، مش طول الكود.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.guardian_rand(n int) RETURNS int AS $$
  SELECT ((get_byte(b, 0) * 256 + get_byte(b, 1)) % n)
  FROM (SELECT uuid_send(gen_random_uuid()) AS b) AS r;
$$ LANGUAGE sql VOLATILE;

CREATE OR REPLACE FUNCTION app.new_guardian_code() RETURNS text AS $$
DECLARE
  letters    CONSTANT text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  digits     CONSTANT text := '23456789';
  symbols    CONSTANT text := '@#$%&*+=?';
  everything CONSTANT text := letters || digits || symbols;
  chars text[];
  code  text;
  i int;
  j int;
  swap text;
BEGIN
  LOOP
    chars := ARRAY[
      substr(letters, app.guardian_rand(length(letters)) + 1, 1),
      substr(digits,  app.guardian_rand(length(digits)) + 1, 1),
      substr(symbols, app.guardian_rand(length(symbols)) + 1, 1)
    ];
    FOR i IN 1..3 LOOP
      chars := chars || substr(everything, app.guardian_rand(length(everything)) + 1, 1);
    END LOOP;
    -- Fisher–Yates: الحرف والرقم والرمز مايفضلوش في أول تلات خانات دايمًا.
    FOR i IN REVERSE 6..2 LOOP
      j := app.guardian_rand(i) + 1;
      swap := chars[i];
      chars[i] := chars[j];
      chars[j] := swap;
    END LOOP;
    code := array_to_string(chars, '');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM app.student_profiles WHERE guardian_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE "app"."student_profiles" DROP CONSTRAINT "student_profiles_guardian_code_shape";

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT "user_id" FROM "app"."student_profiles" LOOP
    UPDATE "app"."student_profiles"
       SET "guardian_code" = app.new_guardian_code()
     WHERE "user_id" = r."user_id";
  END LOOP;
END $$;

ALTER TABLE "app"."student_profiles"
  ADD CONSTRAINT "student_profiles_guardian_code_shape"
  CHECK ("guardian_code" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789@#$%&*+=?]{6}$');
