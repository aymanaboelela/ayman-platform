-- ختم «جاهز» ومين داسه، وقيدين يخلّوا الحالة والختم ما يتخانقوش — نفس شكل
-- `book_orders_printing_status_has_a_stamp` بالظبط، وفي اتجاه واحد لنفس
-- السبب: الطلب بيعدّي لـ`shipped` والختم بيفضل مكانه.

ALTER TABLE "app"."book_orders"
  ADD COLUMN "ready_at"         TIMESTAMP(3),
  ADD COLUMN "ready_by_user_id" TEXT,
  ADD CONSTRAINT "book_orders_ready_by_user_id_fkey"
    FOREIGN KEY ("ready_by_user_id") REFERENCES "app"."users"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_ready_status_has_a_stamp"
  CHECK ("status" <> 'ready' OR "ready_at" IS NOT NULL);

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_courier_status_has_a_stamp"
  CHECK ("status" <> 'courier' OR "courier_sent_at" IS NOT NULL);

-- ⚠️ الفهرس الجزئي بتاع «إيرادات الكتب» اتبنى على `('paid','shipped','delivered')`
-- بس — يعني طلب في المطبعة كان بيختفي من الإيرادات لحد ما يتشحن (`printing`
-- عمره ما اتضاف للقايمة دي). `BOOK_COUNTED_SQL` اتصلّح يشيل كل حالة مدفوعة،
-- والفهرس لازم يتبني على نفس الشرط بالحرف وإلا الـplanner مش هيستخدمه.
DROP INDEX IF EXISTS "app"."book_orders_paid_at_counted_idx";
CREATE INDEX "book_orders_paid_at_counted_idx"
  ON "app"."book_orders" ("paid_at")
  WHERE "status" IN ('paid', 'printing', 'ready', 'courier', 'shipped', 'delivered') AND "deleted_at" IS NULL;
