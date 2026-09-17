-- ═══════════════════════════════════════════════════════════════════════════
-- Why the runner stopped, when it stopped itself.
--
-- `CampaignRunner` could already pause a campaign without being asked — it
-- does so when the WhatsApp device drops mid-run, because marching four
-- thousand recipients into `failed` over a pairing lost at 2am is
-- unrecoverable. It just could not say so anywhere an operator looks: the
-- reason went to `logger.error` and the screen showed a campaign that had
-- mysteriously stopped.
--
-- The new pause this column exists for makes that gap untenable. The runner
-- now halts a campaign whose first messages were all accepted by WhatsApp and
-- delivered to nobody — the 2026-09 failure, caught at five recipients
-- instead of seventy-four. A campaign that stops itself for THAT reason and
-- shows no explanation reads as a bug in the runner, and the operator's
-- correct-looking response is to press resume, which is the one thing that
-- must not happen.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."marketing_campaigns"
    ADD COLUMN "paused_reason" VARCHAR(200);
