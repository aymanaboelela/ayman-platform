-- ═══════════════════════════════════════════════════════════════════════════
-- «الإجابة المتسجّلة صح» — a way off the suspect-key band for a key that is
-- right.
--
-- The band listed every alerted version for as long as most answers sat on
-- one unkeyed option, and the only way off was fixing the key. When the key
-- is right and the students share a misconception (10,000 bits read as
-- 10,000 bytes; 7 bit vs 4 bit read as 3 times), nothing could ever clear
-- it, and the same four rows sat on the overview for good.
--
-- Additive only: two nullable columns, no default, no backfill. Every
-- existing alert stays unconfirmed and keeps showing until someone decides.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."suspect_key_alerts"
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_by" TEXT;
