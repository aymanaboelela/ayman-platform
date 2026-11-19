-- «الحساب ده جه منين» — the ad link a browser arrived through before it made
-- an account: `utm_source` / `utm_medium` / `utm_campaign` / `utm_content` /
-- `utm_term`, and Facebook's own `fbclid`.
--
-- Additive only: one new table, no change to any existing row, and no
-- backfill — an account that predates it has no first touch to recover, and
-- the API refuses to write one for any account more than a day old.
-- No GRANT: `ALTER DEFAULT PRIVILEGES` in the entrypoint covers new tables.
--
-- `user_id` is the PRIMARY KEY, the way `wallets` does it: one row per
-- account is the whole rule («the first touch, never a second»), and the
-- database is where two racing requests are told apart.
--
-- No index beyond it. The report groups the whole table, which is one row per
-- account that came from an ad link — small next to `users`, and read by one
-- admin screen.

CREATE TABLE "app"."user_acquisition" (
    "user_id" TEXT NOT NULL,
    "source" VARCHAR(120),
    "medium" VARCHAR(120),
    "campaign" VARCHAR(120),
    "content" VARCHAR(120),
    "term" VARCHAR(120),
    "fbclid" VARCHAR(512),
    "landing_path" VARCHAR(300),
    "first_touch_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_acquisition_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "app"."user_acquisition"
  ADD CONSTRAINT "user_acquisition_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Same rule as the contract (`AcquisitionClaimSchema`): a row that names no
-- source at all says nothing, and would sit in the report as a blank line.
ALTER TABLE "app"."user_acquisition"
  ADD CONSTRAINT "user_acquisition_names_a_source"
  CHECK (
    COALESCE("source", "medium", "campaign", "content", "term", "fbclid") IS NOT NULL
  );
