-- ═══════════════════════════════════════════════════════════════════════════
-- «السناتر» — الأساس: السنتر، مواعيده، حجز الطالب، والحضور.
--
-- الطالب بيختار «أونلاين ولا سنتر»، ولو سنتر بيحجز ميعاد (يوم وساعة). في
-- السنتر الأدمن بيفتح كاميرا الموبايل على الباب، ويقرا الـQR/الباركود اللي على
-- ملف الطالب، فيتسجّل «حضر». يوم فيه تسجيلات = حصة؛ المحجوز فيها ومسجّلش =
-- غايب. يوم من غير ولا تسجيل = مفيش حصة (إجازة) ومحدش غايب.
--
-- ## بالداتا مش ببوابة
--
-- ستاك مالوش ولا سنتر شغّال مابيسألش «أونلاين ولا سنتر» أصلًا. فالفيتشر لكل
-- المدرّسين، ومحدش بيشوفها غير اللي ضاف سنتر.
--
-- ## رقم الطالب
--
-- `student_number` رقم قصير ثابت (من ١٠٠١) — هو «ID» على ملف الطالب وهو اللي
-- في الباركود. مش سر زي `guardian_code`: بيسجّل حضور بس، ومن حساب أدمن.
-- `ADD COLUMN ... DEFAULT nextval` بيملّي كل الصفوف الموجودة في نفس الجملة.
--
-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES للجداول
-- والـsequences.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "app"."study_type" AS ENUM ('general', 'azhari');
CREATE TYPE "app"."attendance_mode" AS ENUM ('online', 'center');
CREATE TYPE "app"."center_booking_status" AS ENUM ('active', 'cancelled');
CREATE TYPE "app"."attendance_method" AS ENUM ('scan', 'manual');

CREATE SEQUENCE "app"."student_number_seq" START WITH 1001;

ALTER TABLE "app"."student_profiles"
  ADD COLUMN "study_type"      "app"."study_type",
  ADD COLUMN "attendance_mode" "app"."attendance_mode",
  ADD COLUMN "student_number"  INTEGER NOT NULL DEFAULT nextval('app.student_number_seq');

CREATE UNIQUE INDEX "student_profiles_student_number_key" ON "app"."student_profiles"("student_number");

CREATE TABLE "app"."centers" (
  "id"         UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "address"    TEXT,
  "phone"      TEXT,
  "map_url"    TEXT,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "position"   INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "centers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "centers_name_not_blank" CHECK (length(btrim("name")) > 0)
);

CREATE TABLE "app"."center_slots" (
  "id"           UUID NOT NULL,
  "center_id"    UUID NOT NULL,
  "label"        TEXT,
  "day_of_week"  INTEGER NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute"   INTEGER NOT NULL,
  "year"         INTEGER,
  "capacity"     INTEGER,
  "is_full"      BOOLEAN NOT NULL DEFAULT false,
  "is_active"    BOOLEAN NOT NULL DEFAULT true,
  "price_cents"  INTEGER,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "center_slots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "center_slots_day" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "center_slots_minutes" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute"),
  CONSTRAINT "center_slots_capacity" CHECK ("capacity" IS NULL OR "capacity" > 0),
  CONSTRAINT "center_slots_price" CHECK ("price_cents" IS NULL OR "price_cents" >= 0)
);
CREATE INDEX "center_slots_center_id_idx" ON "app"."center_slots"("center_id");

CREATE TABLE "app"."center_bookings" (
  "id"           UUID NOT NULL,
  "slot_id"      UUID NOT NULL,
  "user_id"      TEXT NOT NULL,
  "status"       "app"."center_booking_status" NOT NULL DEFAULT 'active',
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMP(3),
  CONSTRAINT "center_bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "center_bookings_cancel_pair" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL))
);
CREATE INDEX "center_bookings_slot_id_status_idx" ON "app"."center_bookings"("slot_id", "status");
CREATE INDEX "center_bookings_user_id_status_idx" ON "app"."center_bookings"("user_id", "status");
-- حجز واحد شغّال لكل طالب. تغيير الميعاد = إلغاء القديم وكتابة جديد، في نفس
-- الترانزاكشن.
CREATE UNIQUE INDEX "center_bookings_one_active_per_user" ON "app"."center_bookings"("user_id") WHERE "status" = 'active';

CREATE TABLE "app"."attendance_sessions" (
  "id"         UUID NOT NULL,
  "slot_id"    UUID NOT NULL,
  "date"       DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_sessions_slot_id_date_key" ON "app"."attendance_sessions"("slot_id", "date");

CREATE TABLE "app"."attendance_records" (
  "id"                 UUID NOT NULL,
  "session_id"         UUID NOT NULL,
  "user_id"            TEXT NOT NULL,
  "scanned_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scanned_by_user_id" TEXT,
  "method"             "app"."attendance_method" NOT NULL DEFAULT 'scan',
  "fee_cents"          INTEGER,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_records_fee" CHECK ("fee_cents" IS NULL OR "fee_cents" >= 0)
);
CREATE UNIQUE INDEX "attendance_records_session_id_user_id_key" ON "app"."attendance_records"("session_id", "user_id");
CREATE INDEX "attendance_records_user_id_idx" ON "app"."attendance_records"("user_id");

ALTER TABLE "app"."center_slots" ADD CONSTRAINT "center_slots_center_id_fkey"
  FOREIGN KEY ("center_id") REFERENCES "app"."centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."center_bookings" ADD CONSTRAINT "center_bookings_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "app"."center_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."center_bookings" ADD CONSTRAINT "center_bookings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attendance_sessions" ADD CONSTRAINT "attendance_sessions_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "app"."center_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "app"."attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."attendance_records" ADD CONSTRAINT "attendance_records_scanned_by_user_id_fkey"
  FOREIGN KEY ("scanned_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
