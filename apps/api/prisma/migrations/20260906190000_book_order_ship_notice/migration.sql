-- ═══════════════════════════════════════════════════════════════════════════
-- «ممكن أبعت الواتساب مرتين للشخص» — العمود اللي بيمنع ده.
--
-- Marking an order shipped now sends the student a WhatsApp message («الكتاب
-- اتشحن النهاردة»). Shipping is done in bulk, from a list the admin re-opens
-- through the day, and the one thing that must never happen is the same
-- student getting that message twice because a row was re-selected.
--
-- A timestamp rather than a boolean, and for the usual reason: «اتبعتله» and
-- «اتبعتله امتى» are the same fact, and a boolean throws half of it away. It
-- is also what lets the list say «الرسالة اتبعتت الساعة كذا» instead of a
-- checkmark nobody can audit.
--
-- ⚠️ Deliberately NOT derived from `shipped_at`. They are different events and
-- they can legitimately disagree: an order shipped before this column existed
-- has `shipped_at` set and no notice (correct — nothing was sent, and the
-- backfill below leaves those alone rather than inventing a send), and a send
-- that fails leaves `shipped_at` set with the notice still null, which is
-- exactly the state a retry needs to find.
ALTER TABLE "app"."book_orders"
  ADD COLUMN "ship_notice_sent_at" TIMESTAMPTZ;

-- Why the failure is stored and not just logged: the admin re-opening the
-- list is the only person who can act on «الرقم ده مش على واتساب», and a log
-- line on the server is not reachable from the screen where the decision is
-- made. Null on success, null before any attempt — the pair with
-- `ship_notice_sent_at` says which of the three states a row is in.
ALTER TABLE "app"."book_orders"
  ADD COLUMN "ship_notice_error" TEXT;

-- Every already-shipped order is treated as "notice never sent", which is the
-- truth: this feature did not exist when they shipped. It also means the very
-- first bulk-ship after this migration cannot accidentally re-message the 40
-- students who already have their books — those rows are `shipped`, and the
-- send only ever runs on the `paid` → `shipped` transition.
