-- ختم «مرتجع»، ومين سجّله، والسبب (اختياري — كلام شركة الشحن أو الأدمن).
-- القيد في اتجاه واحد زي `book_orders_printing_status_has_a_stamp`: الطلب
-- ممكن يتبعت تاني من «مرتجع» والختم يفضل مكانه.
ALTER TABLE "app"."book_orders"
  ADD COLUMN "returned_at"         TIMESTAMP(3),
  ADD COLUMN "returned_by_user_id" TEXT,
  ADD COLUMN "return_reason"       TEXT,
  ADD CONSTRAINT "book_orders_returned_by_user_id_fkey"
    FOREIGN KEY ("returned_by_user_id") REFERENCES "app"."users"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_returned_status_has_a_stamp"
  CHECK ("status" <> 'returned' OR "returned_at" IS NOT NULL);

-- «مرتجع» لسه فلوس اتدفعت — المرتجع مش استرداد (الاسترداد صف في `refunds`).
-- فالفهرس الجزئي بتاع الإيرادات لازم يشمله، بنفس شرط `BOOK_COUNTED_SQL` بالحرف.
DROP INDEX IF EXISTS "app"."book_orders_paid_at_counted_idx";
CREATE INDEX "book_orders_paid_at_counted_idx"
  ON "app"."book_orders" ("paid_at")
  WHERE "status" IN ('paid', 'printing', 'shipped', 'delivered', 'returned') AND "deleted_at" IS NULL;
