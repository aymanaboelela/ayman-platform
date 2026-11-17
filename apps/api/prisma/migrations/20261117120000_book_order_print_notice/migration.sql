-- «الكتاب في الطباعة» — tell the student when their paid order goes to the
-- printer. Orders sat in `printing` for days with nothing said after the
-- payment was confirmed, and students asked in chat.
--
-- `print_notice_sent_at` is the one-order-one-notice guard, claimed with a
-- conditional UPDATE in the same transaction as the notification row. Nullable
-- and default-free: every existing row means "never told", which is true.
--
-- ⚠️ `ADD VALUE` is not used in this same migration by any statement, so the
-- "new enum value cannot be used in the same transaction" rule does not bite.

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'book_order_printing' AFTER 'book_order_shipped';

ALTER TABLE "app"."book_orders" ADD COLUMN "print_notice_sent_at" TIMESTAMP(3);
