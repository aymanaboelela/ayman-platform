-- ═══════════════════════════════════════════════════════════════════════════
-- «حفظ أولياء الأمور في جهات الاتصال» — the same "already on my phone" record,
-- now for a student's parents as well as the student.
--
-- The two are separate facts: an admin who saved the students last week has
-- not saved a single father, and the parents' first press must hand over all
-- of them. So `kind` joins the primary key instead of a second table with the
-- same three columns. Every existing row is a student export, which is what
-- the DEFAULT stamps on them.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."contact_exports"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'student';

ALTER TABLE "app"."contact_exports"
  ADD CONSTRAINT "contact_exports_kind_check" CHECK ("kind" IN ('student', 'parents'));

ALTER TABLE "app"."contact_exports" DROP CONSTRAINT "contact_exports_pkey";

ALTER TABLE "app"."contact_exports"
  ADD CONSTRAINT "contact_exports_pkey" PRIMARY KEY ("admin_user_id", "student_user_id", "kind");
