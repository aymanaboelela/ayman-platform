-- Make `push_subscriptions` hold NATIVE device tokens as well as browsers.
--
-- The table was web-push shaped: an endpoint URL plus the two keys `web-push`
-- needs to encrypt a payload the browser can decrypt. FCM has neither — it
-- takes an opaque registration token and does its own encryption — so the
-- obvious move was a second table.
--
-- It stays ONE table because the question a fan-out asks never changes:
-- "every place this person can be reached". Two tables means a fan-out that
-- reads one and forgets the other, and that failure is silent — a student who
-- once subscribed in a browser keeps getting notified while every phone in the
-- house stays quiet.

CREATE TYPE "app"."push_platform" AS ENUM ('web', 'android', 'ios');

ALTER TABLE "app"."push_subscriptions"
  ADD COLUMN "platform" "app"."push_platform" NOT NULL DEFAULT 'web',
  ADD COLUMN "app_version" TEXT,
  ADD COLUMN "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Every existing row IS a browser, so the DEFAULT above already backfilled
-- them correctly and nothing that reads this table has to handle a null.

-- The two web-push keys become optional, because a phone has neither.
ALTER TABLE "app"."push_subscriptions"
  ALTER COLUMN "p256dh" DROP NOT NULL,
  ALTER COLUMN "auth" DROP NOT NULL;

-- ⚠️ …and the pairing moves into a CHECK, so dropping NOT NULL does not
-- quietly permit a web row with no keys.
--
-- A web-push send needs BOTH keys; without them the row is a subscription that
-- can never be delivered to, and nothing downstream would notice — `web-push`
-- would throw at send time, inside a fan-out, for one recipient. Stated as a
-- constraint, the bad row cannot be written in the first place.
--
-- Native rows must have NEITHER, which is the same rule read the other way: a
-- p256dh on an FCM token is a value nothing will ever use and a reader would
-- reasonably mistake for a web subscription.
ALTER TABLE "app"."push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_web_keys" CHECK (
    (platform = 'web' AND p256dh IS NOT NULL AND auth IS NOT NULL)
    OR
    (platform <> 'web' AND p256dh IS NULL AND auth IS NULL)
  );

-- The fan-out reads "every subscription for this user" and then splits by
-- transport. `(user_id)` already covers the read; this one makes the SWEEP
-- cheap — deleting tokens that have not been seen in months, which is the only
-- way a row for an uninstalled app is ever removed. FCM keeps accepting sends
-- to a dead token and silently drops them, so nothing else reports it.
CREATE INDEX "push_subscriptions_last_seen_at_idx"
  ON "app"."push_subscriptions" ("last_seen_at");
