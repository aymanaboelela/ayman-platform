-- ═══════════════════════════════════════════════════════════════════════════
-- لوحة الشرف بالإيد — تكريم من غير ورقة امتحان وراه.
--
-- اللوحة لحد النهارده كانت بتتولد من `quiz_attempts.honor_board_at` بس:
-- المدرّس بيثبّت ورقة اتصحّحت، واللوحة بتتبني من الورق المثبّت. ده بيغطّي
-- «الأوائل في امتحان الشهر» وخلاص. واللي اتطلب أوسع: حد يتكرّم على حاجة
-- الورق مايعرفهاش — انتظام، تحسّن، الأول على الدفعة — وبتاريخ المدرّس هو
-- اللي بيختاره.
--
-- ## ليه جدول تاني ومش عمود على `quiz_attempts`
--
-- الصف هنا **مالوش ورقة**. لو اتحط كـattempt وهمية كان لازم كويز وهمي
-- ومحاضرة وهمية، وكانوا هيظهروا في التصحيح وفي الإحصائيات وفي «كام واحد دخل
-- الامتحان» — كل واحدة فيهم كذبة على شاشة تانية.
--
-- الاتنين بيتدمجوا وقت القراية (`toHonorBoardRounds`)، والدمج بيحصل على
-- اليوم المصري: الصف اللي هنا بيتبوّب بنفس `Africa/Cairo` اللي بتبوّب
-- `honor_board_at`، فالورقة المثبّتة والصف اليدوي في نفس اليوم بيقعوا في نفس
-- الدور على الأرشيف.
--
-- ## ⚠️ الصف ده بينشر اسم طالب قاصر على صفحة عامة
--
-- نفس تحذير `honor_board_at` وأقوى — هنا مفيش حتى امتحان بيبرّر الاسم.
-- مفيش حاجة بتكتب في الجدول ده غير دوسة أدمن على `/admin/honor-board`،
-- وعمره ما هيتولّد من درجة ولا من ترتيب.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."honor_board_pins" (
  "id"            UUID NOT NULL,
  "user_id"       TEXT NOT NULL,
  "honored_at"    TIMESTAMPTZ(3) NOT NULL,
  "rank"          SMALLINT NOT NULL,
  "course_id"     UUID,
  "reason"        TEXT NOT NULL,
  "photo_key"     TEXT,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "honor_board_pins_pkey" PRIMARY KEY ("id")
);

-- أربع خانات بتتعرض على الصفحة الرئيسية، والباقي في الأرشيف. السقف موجود
-- عشان رقم مكتوب غلط (٥٠) مايقلبش الترتيب كله ومايطلعش «المركز الـ٥٠».
ALTER TABLE "app"."honor_board_pins"
  ADD CONSTRAINT "honor_board_pins_rank_range" CHECK ("rank" BETWEEN 1 AND 10);

-- السطر اللي تحت الاسم على الكارت. فاضي معناه كارت فيه اسم ومركز ومافيش
-- سبب — والكارت بيحجز مكان للسطر ده أصلاً.
ALTER TABLE "app"."honor_board_pins"
  ADD CONSTRAINT "honor_board_pins_reason_not_blank" CHECK (btrim("reason") <> '');

-- التكريم بتاع الطالب بيروح مع حسابه؛ الكورس والأدمن لأ.
ALTER TABLE "app"."honor_board_pins"
  ADD CONSTRAINT "honor_board_pins_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."honor_board_pins"
  ADD CONSTRAINT "honor_board_pins_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "app"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."honor_board_pins"
  ADD CONSTRAINT "honor_board_pins_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- القراية الأساسية: الأدوار، الأحدث الأول.
CREATE INDEX "honor_board_pins_honored_at_idx"
  ON "app"."honor_board_pins" ("honored_at" DESC);

-- «الطالب ده متكرّم قبل كده؟» — كارت الداشبورد بتاعه بيسأل ده على كل فتحة.
CREATE INDEX "honor_board_pins_user_id_honored_at_idx"
  ON "app"."honor_board_pins" ("user_id", "honored_at" DESC);

-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES FOR ROLE
-- ayman_migrator، فأي جدول بيتعمل من الميجريشن بياخد صلاحياته لـayman_runtime
-- لوحده. GRANT هنا كان هيشتغل وكان هيوحي إن الافتراضي مش مضمون.
