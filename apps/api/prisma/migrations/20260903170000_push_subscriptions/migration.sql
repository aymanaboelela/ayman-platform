-- Web Push — the leg of the notification system that reaches a browser with
-- NO tab open at all.
--
-- WHAT PROBLEM THIS SOLVES
--
-- `NotificationsRealtimeService` (SSE) and the OS `Notification` it raises
-- only ever reach a tab that is already open somewhere. Every admin-facing
-- kind (`payment_submitted`, `book_order_placed`, and now
-- `assistant_question_received`) was arriving hours late whenever nobody
-- happened to have `/admin` open at the moment — which, for most of the day,
-- is exactly the case. `PushSubscription` is what `PushService.notifyUser`
-- sends to instead: the browser vendor's own push service, which wakes the
-- device even with the site closed.
--
-- WHY A NEW TABLE AND NOT A COLUMN ON `users`
--
-- One admin can hold several subscriptions at once — the same account signed
-- in on a phone and a laptop — and every one of them has to be woken, so this
-- is one row per subscribed BROWSER, not per user.
--
-- ON DELETE CASCADE, unlike `conversations`/`assistant_questions`
--
-- A subscription has no value once the account it wakes up is gone — there is
-- no "the endpoint outlives the user" case the way a chat question's WORDING
-- does. Same choice `notifications` itself makes.
--
-- `endpoint` IS THE DEDUP KEY
--
-- The push service's own subscription URL, unique per browser install.
-- Re-clicking "enable notifications" on a browser already subscribed returns
-- the SAME endpoint, so `PushService.subscribe` upserts on it rather than
-- growing a duplicate row that would double-send.

CREATE TABLE "app"."push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "app"."push_subscriptions" ("endpoint");

-- "every subscription this admin has" — read once per notification fan-out,
-- a handful of rows per person.
CREATE INDEX "push_subscriptions_user_id_idx" ON "app"."push_subscriptions" ("user_id");

ALTER TABLE "app"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The third kind addressed to staff rather than to a student — see
-- `NotificationsService.EmitInput` and `AssistantController`.
--
-- ⚠️ `ALTER TYPE … ADD VALUE` and nothing else in this migration, same rule
-- `20260903160000_admin_notification_kinds` documents: Postgres allows it
-- inside a transaction (12+) only if the new value is not USED in the same
-- transaction, and Prisma wraps every migration in one.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'assistant_question_received';
