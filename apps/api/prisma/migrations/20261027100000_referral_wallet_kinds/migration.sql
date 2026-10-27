-- ═══════════════════════════════════════════════════════════════════════════
-- «ادعي صاحبك» — the two ledger kinds a referral moves money with.
--
-- `referral_reward` puts the reward into both wallets (the student who shared
-- the link, and the friend who paid); `referral_reversal` takes it back when
-- that payment is refunded or an admin voids the referral.
--
-- ## Why this file holds nothing else
--
-- Postgres does not let a new enum value be used in the transaction that
-- added it, and Prisma runs each migration file in one transaction. The next
-- file (`20261027100100_referrals`) rewrites the ledger's CHECKs to name both
-- values, so it has to run in a transaction of its own. Same split as
-- `20261025200000_exam_signal_event_kind`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."wallet_transaction_kind" ADD VALUE IF NOT EXISTS 'referral_reward';
ALTER TYPE "app"."wallet_transaction_kind" ADD VALUE IF NOT EXISTS 'referral_reversal';
