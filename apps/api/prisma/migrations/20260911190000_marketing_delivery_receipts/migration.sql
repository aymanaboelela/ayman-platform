-- ═══════════════════════════════════════════════════════════════════════════
-- «الرسايل بتتبعت بس مش بتوصل» — the second tick.
--
-- The campaign screen has always reported `sent` as success, and `sent` meant
-- one thing only: `sock.sendMessage()` resolved inside the sidecar. That is
-- WhatsApp's server taking custody of the message — ONE grey tick. Whether it
-- was then delivered to a single device was never asked, never answered and
-- nowhere recorded.
--
-- So a run in which WhatsApp accepted all 74 messages and delivered none read
-- «٧٤ من ٧٤ · اتبعت · ٠ فشل» — byte-identical to a perfect run. The failure
-- was found by the instructor looking at his own phone and noticing one tick,
-- weeks in. Nothing on the platform could have told him.
--
-- These two columns are the missing half:
--
--   · `message_id`  — WhatsApp's own id for the message. The sidecar has
--     ALWAYS returned it (`/send` → `{ messageId }`); the runner discarded it
--     on the floor. Without it a receipt arriving later — out of band, minutes
--     after the send, on a different connection — has no way to find the row
--     it belongs to.
--   · `delivered_at` — when a device, not a server, acknowledged it.
--
-- ## Why not a fifth `campaign_recipient_status`
--
-- Because delivery is a SECOND axis, not a later stage. `sent` and `failed`
-- describe what the send attempt did; delivery describes what happened to the
-- message afterwards, asynchronously, and can arrive for a row whose status
-- will never change again. Folding it into the enum would mean a delivered
-- message stops counting as sent — breaking the progress bar, the pending
-- maths and every existing filter — and would make «اتبعتت ومحدش استلمها»,
-- the one view that matters here, inexpressible.
--
-- ## Backfill: deliberately none
--
-- Every row that predates this migration has `delivered_at = NULL`, and that
-- is the honest value: we do not know whether those messages arrived, and the
-- receipts that would have said so were never listened for and are long gone.
-- Stamping them would invent the very reassurance this column exists to stop
-- the screen from inventing.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."marketing_recipients"
    ADD COLUMN "message_id" VARCHAR(64),
    ADD COLUMN "delivered_at" TIMESTAMP(3);

-- The receipt route's only query: find the row that sent this message id.
-- Plain, not partial: Prisma's schema language cannot express a WHERE clause
-- on an index, so a partial one here would read as drift on every check.
CREATE INDEX "marketing_recipients_message_id_idx"
    ON "app"."marketing_recipients" ("message_id");
