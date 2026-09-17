-- ═══════════════════════════════════════════════════════════════════════════
-- «لما أضغط مجاني يروح للمدفوع عشان يتشحن» — the giveaway orders that got
-- stranded in «بدأ ومكملش الدفع».
--
-- `markFree` wrote the flag and nothing else, so an order labelled «مجاني»
-- after the fact kept `status = 'address_only'`. Both ship routes
-- (`markShipped`, `markShippedMany`) take ONLY `paid` rows, so those orders
-- could not be shipped at all: the badge said the money question was answered
-- and the tab said the order had never started, and the only way out was to
-- edit the row and give it a price nobody was ever charged.
--
-- The rule the create dialog already followed — a free order is `paid: true`
-- AND `is_free: true`, because there is nothing left to collect — is now what
-- `markFree` writes too. This is the same fix applied to the rows that predate
-- it.
--
-- ## Only `address_only`, and only live rows
--
-- A giveaway that already shipped, arrived or was rejected keeps the state it
-- reached; this is about orders with nowhere to go, not a re-statement of what
-- happened to the parcel. Soft-deleted rows keep the state they were hidden
-- IN — that is what the soft delete is for.
--
-- It moves NO money: «إيرادات الكتب» reads `BOOK_REVENUE_WHERE`, which excludes
-- `is_free` rows by name, and `book_orders_free_collects_nothing` already pins
-- `amount_cents` to 0 on every row this touches.
--
-- `paid_at` is back-dated to `updated_at` — the moment the flag was actually
-- set — rather than to `now()`. The shipping desk sorts and exports on that
-- column, and stamping today on an order comped a week ago would put it at the
-- wrong end of a queue that is deliberately first-come-first-served.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "app"."book_orders"
SET "status" = 'paid',
    "paid_at" = COALESCE("paid_at", "updated_at")
WHERE "is_free"
  AND "status" = 'address_only'
  AND "deleted_at" IS NULL;
