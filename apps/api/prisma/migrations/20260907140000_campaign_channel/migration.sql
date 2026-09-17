-- ═══════════════════════════════════════════════════════════════════════════
-- «عايزها تتبعت على المنصة، مش واتساب» — قناة التوصيل للحملة.
--
-- Campaigns could only ever go out over WhatsApp, through the one linked
-- personal device. That is the channel that can be rate-limited, can be
-- offline, and can get the number banned — and it is the reason the whole
-- pacing machinery below it exists. The platform thread has none of those
-- failure modes: it is a row in our own database, it cannot bounce, and
-- nobody can ban it.
--
-- ⚠️ `whatsapp` is the DEFAULT and that is deliberate, not a shrug. Every
-- campaign already stored in this table was sent over WhatsApp; defaulting to
-- anything else would relabel finished history as something that never
-- happened. The column is therefore safe to add to a live table with no
-- back-fill at all.
--
-- `both` exists but is nobody's default: it doubles the message for every
-- student who has an account AND a phone, and «وصلتني مرتين» is exactly the
-- complaint that makes the next campaign get ignored.
CREATE TYPE "app"."campaign_channel" AS ENUM ('whatsapp', 'platform', 'both');

ALTER TABLE "app"."marketing_campaigns"
  ADD COLUMN "channel" "app"."campaign_channel" NOT NULL DEFAULT 'whatsapp';
