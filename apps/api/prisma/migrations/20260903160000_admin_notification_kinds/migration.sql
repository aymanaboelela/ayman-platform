-- The first two notification kinds addressed to STAFF rather than to a student.
--
-- Ordinary `notifications` rows, emitted one per user holding the matching
-- permission at the moment of the event. The alternative — a fire-and-forget
-- socket event with no table behind it — loses every alert that arrives while
-- nobody has the tab open, which is most of them.
--
-- ⚠️ `ALTER TYPE … ADD VALUE` and nothing else in this migration. Postgres
-- allows it inside a transaction (12+) only if the new value is not USED in
-- the same transaction, and Prisma wraps every migration in one.
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'payment_submitted';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'book_order_placed';
