-- ═══════════════════════════════════════════════════════════════════════════
-- Inbox: «تثبيت محادثة» and «ملاحظات خاصة على الطالب».
--
-- Additive only: one nullable column on `conversations` and one new table.
-- No GRANT: `ALTER DEFAULT PRIVILEGES` in the entrypoint covers new tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- When the instructor pinned the thread to the top of his inbox; NULL = not
-- pinned. A timestamp rather than a boolean so pinned threads keep the order
-- he pinned them in.
ALTER TABLE "app"."conversations" ADD COLUMN "pinned_at" TIMESTAMP(3);

CREATE INDEX "conversations_pinned_at_idx" ON "app"."conversations"("pinned_at")
  WHERE "pinned_at" IS NOT NULL;

-- One private note per STUDENT (not per thread — a student's outreach thread
-- and the question they opened are the same person), read and written only
-- from the inbox. Never part of any student-facing payload.
CREATE TABLE "app"."student_staff_notes" (
  "user_id"            TEXT NOT NULL,
  "body"               TEXT NOT NULL,
  "updated_by_user_id" TEXT,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_staff_notes_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "student_staff_notes_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000)
);

ALTER TABLE "app"."student_staff_notes"
  ADD CONSTRAINT "student_staff_notes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."student_staff_notes"
  ADD CONSTRAINT "student_staff_notes_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
