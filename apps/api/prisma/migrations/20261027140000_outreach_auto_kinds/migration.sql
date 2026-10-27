-- ═══════════════════════════════════════════════════════════════════════════
-- «رسايل الواتساب التلقائية» — two new reasons the platform speaks first:
-- `checkout_recovery` (a payment step opened and left) and `signup_nudge` (an
-- account that bought nothing). Both are swept by `AutoOutreachSweeper` and
-- sent over WhatsApp as well as into the chat.
--
-- ## Why this file holds nothing else
--
-- Postgres does not let a new enum value be used in the transaction that
-- added it, and Prisma runs each migration file in one transaction. Same
-- reason as `20261025200000_exam_signal_event_kind`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."outreach_kind" ADD VALUE IF NOT EXISTS 'checkout_recovery';
ALTER TYPE "app"."outreach_kind" ADD VALUE IF NOT EXISTS 'signup_nudge';
