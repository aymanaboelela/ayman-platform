-- ═══════════════════════════════════════════════════════════════════════════
-- الحالات الجديدة للطلب — «وصل» و«مرفوض»، وإشعاراتهم.
--
-- ## Why this migration adds ONLY enum values, and the columns wait for the next
--
-- Postgres cannot USE a value in the same transaction that adds it. Prisma runs
-- each migration file in one transaction, so a CHECK constraint naming
-- 'rejected', or a backfill writing 'delivered', has to live in a LATER file
-- than the `ALTER TYPE`. `20260903000000_home_block_books` hit the same wall and
-- solved it the same way. Splitting it is not tidiness — a combined file fails
-- with `unsafe use of new value` on a database that has never seen the label.
--
-- ## `delivered` — «لازم أتأكد إنه وصل»
--
-- `shipped` is «سلّمناه للشحن», which is the last thing the platform knew and
-- not the last thing that happened. A book sits with a courier for days, and
-- the only person who learns it arrived is the student. Making arrival its own
-- state is what lets the dashboard stop saying «في الطريق» and lets the admin
-- see, in one filter, the orders still owed to somebody.
--
-- It is a FOURTH state and not a boolean beside `shipped` for the reason every
-- other status here is a state: the transition is the thing that fires the
-- notification, and a nullable timestamp read as a status is how two surfaces
-- end up disagreeing about whether an order is done.
--
-- ## `rejected` — the twin of `payment_rejected`, and NOT the same as deleting
--
-- «أرفضه» is a decision the student is owed an answer about: the money did not
-- arrive, the address is unreachable, the screenshot is somebody else's. It
-- keeps the row, keeps it in the list, and shows the student what happened.
--
-- Deleting is the other thing Ayman asked for and it is deliberately NOT a
-- status — see `deleted_at` in the next migration. A status describes the
-- order; deletion describes the admin's view of it.
--
-- There is no `cancelled`: nobody has asked for a student-initiated cancel, and
-- a value no code can produce is a value every `switch` has to handle anyway.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "app"."book_order_status" ADD VALUE IF NOT EXISTS 'delivered' AFTER 'shipped';
ALTER TYPE "app"."book_order_status" ADD VALUE IF NOT EXISTS 'rejected' AFTER 'delivered';

-- The two moments a student is told something changed. `book_order_placed`
-- already exists and fires at submit; these close the loop at both ends of the
-- courier's part of it.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'book_order_shipped';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'book_order_delivered';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'book_order_rejected';
