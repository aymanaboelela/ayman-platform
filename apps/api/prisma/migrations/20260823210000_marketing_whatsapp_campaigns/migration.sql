-- التسويق — حملات واتساب.
--
-- WHAT THIS IS FOR
--
-- Announcing a lecture to the cohort on the channel they actually read. The
-- platform already has every student's phone number; what it has never had is
-- a way to send anything to it. Everything outbound until now was in-app.
--
-- WHY THE RECIPIENTS ARE A TABLE AND NOT A QUERY
--
-- A campaign takes days, not seconds — a personal WhatsApp number cannot be
-- pushed faster than a person could plausibly type without being banned. Over
-- that span the cohort changes: students enrol, numbers get corrected,
-- somebody replies «قف». A sender that re-ran the audience query per message
-- would double-send, would never be able to answer «فاضل كام», and could not
-- be resumed after a deploy. So the list is frozen into rows at creation, and
-- the row IS the queue entry, the audit record and the progress bar.
--
-- WHY THE PACING IS COLUMNS ON THE CAMPAIGN
--
-- Because it is not a preference, it is the safety envelope of that specific
-- run, and it has to be immutable for the run's whole duration. See the model
-- comment in schema.prisma.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- No message-body column on the recipient. Bodies are rendered per recipient
-- at send time from the campaign template, so a typo caught after 40 messages
-- is fixed once and the remaining 4000 get the fix. Storing 4500 rendered
-- copies would also mean storing 4500 copies of a student's first name for no
-- reason anybody could name.
--
-- No delivery receipts. WhatsApp's own ticks are not available through a
-- linked-device session in any form worth depending on; `sent_at` means "the
-- device accepted it", which is the strongest claim this table can honestly
-- make and is exactly what the admin screen says.

CREATE TYPE "app"."campaign_status" AS ENUM ('draft', 'running', 'paused', 'done', 'cancelled');

CREATE TYPE "app"."campaign_recipient_status" AS ENUM ('pending', 'sent', 'failed', 'skipped');

CREATE TABLE "app"."marketing_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "app"."campaign_status" NOT NULL DEFAULT 'draft',
    "image_asset_id" UUID,
    "link_url" TEXT,
    "audience" JSONB NOT NULL,
    "min_delay_seconds" INTEGER NOT NULL DEFAULT 30,
    "max_delay_seconds" INTEGER NOT NULL DEFAULT 90,
    "batch_size" INTEGER NOT NULL DEFAULT 30,
    "batch_pause_minutes" INTEGER NOT NULL DEFAULT 10,
    "daily_cap" INTEGER NOT NULL DEFAULT 200,
    "window_start_hour" INTEGER NOT NULL DEFAULT 10,
    "window_end_hour" INTEGER NOT NULL DEFAULT 22,
    "next_send_at" TIMESTAMP(3),
    "sent_in_batch" INTEGER NOT NULL DEFAULT 0,
    "sent_today" INTEGER NOT NULL DEFAULT 0,
    "day_key" VARCHAR(10),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- The runner's only lookup: "is any campaign due right now". Status first
-- because `running` is a small minority of the rows on any real day.
CREATE INDEX "marketing_campaigns_status_next_send_at_idx"
    ON "app"."marketing_campaigns" ("status", "next_send_at");

CREATE INDEX "marketing_campaigns_created_at_idx"
    ON "app"."marketing_campaigns" ("created_at" DESC);

CREATE TABLE "app"."marketing_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" TEXT,
    "user_id" TEXT,
    "position" INTEGER NOT NULL,
    "status" "app"."campaign_recipient_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "error" VARCHAR(300),

    CONSTRAINT "marketing_recipients_pkey" PRIMARY KEY ("id")
);

-- One number, one message, per campaign. A student who is also listed as
-- their own parent's contact, or who appears in both a course filter and a
-- pasted list, must be messaged once — and this constraint is what makes the
-- audience resolver safe to write as a plain UNION.
CREATE UNIQUE INDEX "marketing_recipients_campaign_id_phone_key"
    ON "app"."marketing_recipients" ("campaign_id", "phone");

-- «اللي بعده» — the pending row with the lowest position. Covers the status
-- filters on the detail screen too.
CREATE INDEX "marketing_recipients_campaign_id_status_position_idx"
    ON "app"."marketing_recipients" ("campaign_id", "status", "position");

CREATE TABLE "app"."marketing_opt_outs" (
    "phone" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_opt_outs_pkey" PRIMARY KEY ("phone")
);

ALTER TABLE "app"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_image_asset_id_fkey"
    FOREIGN KEY ("image_asset_id") REFERENCES "app"."media_assets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CASCADE, unlike everything else here: a recipient row has no meaning
-- without its campaign, and deleting a draft that was never started must not
-- leave four thousand orphans behind.
ALTER TABLE "app"."marketing_recipients"
    ADD CONSTRAINT "marketing_recipients_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "app"."marketing_campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."marketing_recipients"
    ADD CONSTRAINT "marketing_recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
