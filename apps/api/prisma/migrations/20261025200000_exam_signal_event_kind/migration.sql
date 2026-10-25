-- ═══════════════════════════════════════════════════════════════════════════
-- «لما حد يعمل كوبي بيست أعرف، ولو طلع برا الصفحة» — what the exam runner
-- notices during a monthly or course exam (paste, copy, tab hidden, window
-- blurred, page left), kept in the attempt's own ledger.
--
-- ## Why `attempt_events` and not a table of its own
--
-- It is already the per-attempt, append-only record: UPDATE and DELETE are
-- revoked from `ayman_runtime` and a trigger refuses them even to the owner.
-- A student's paste is exactly the kind of fact that must not be editable
-- after the mark it might explain. One more kind, no new table.
--
-- ## Why this file holds nothing else
--
-- Postgres does not let a new enum value be used in the transaction that
-- added it, and Prisma runs each migration file in one transaction. Same
-- reason as `20260922090000_honor_board_listed_kind`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."AttemptEventKind" ADD VALUE IF NOT EXISTS 'exam_signal';
