-- ═══════════════════════════════════════════════════════════════════════════
-- «اشتراكك اتلغى قبل ميعاده» — only when the admin chose to show his reason.
--
-- Why the enum value goes in alone: PostgreSQL 12+ permits ADD VALUE inside a
-- transaction block (which is what Prisma runs migrations in) provided the
-- new label is not USED before the transaction commits. Nothing below
-- inserts a notification, so this holds — same reasoning as
-- `20260826020000_subscription_expiring_soon_notification` before it.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'subscription_cancelled';
