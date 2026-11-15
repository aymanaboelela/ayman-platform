-- ═══════════════════════════════════════════════════════════════════════════
-- «صورة الوحدة» — a cover per course section.
--
-- Additive only: one nullable column, no backfill, no GRANT (the entrypoint's
-- `ALTER DEFAULT PRIVILEGES` covers it). NULL = no picture, and every reader
-- falls back to the generated tile — see `components/library/unit-art.tsx`.
-- Same shape and lifecycle as `courses.cover_key`: a storage key under
-- `/media/`, never a full URL.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."course_sections" ADD COLUMN "cover_key" TEXT;
