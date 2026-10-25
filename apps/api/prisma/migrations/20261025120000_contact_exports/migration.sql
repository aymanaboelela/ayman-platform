-- ═══════════════════════════════════════════════════════════════════════════
-- «حفظ في جهات الاتصال» — which students an admin already took to their phone.
--
-- `/admin/students` hands the filtered list to the phone as one .vcf file. The
-- second press must hand over only the students added since, or every press
-- duplicates the whole cohort in the phone's contacts. One row per (admin,
-- student): per ADMIN, because an assistant's phone holding a student says
-- nothing about the instructor's.
--
-- CASCADE on both sides: the row is a fact about two accounts and means
-- nothing once either is gone.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "app"."contact_exports" (
  "admin_user_id"   TEXT NOT NULL,
  "student_user_id" TEXT NOT NULL,
  "exported_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_exports_pkey" PRIMARY KEY ("admin_user_id", "student_user_id")
);

ALTER TABLE "app"."contact_exports"
  ADD CONSTRAINT "contact_exports_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."contact_exports"
  ADD CONSTRAINT "contact_exports_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "contact_exports_student_user_id_idx" ON "app"."contact_exports"("student_user_id");
