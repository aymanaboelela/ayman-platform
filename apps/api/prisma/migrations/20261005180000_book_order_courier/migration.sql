-- «شركة الشحن» — ربط طلبات الكتب بـTorod. كله إضافة: أعمدة nullable على
-- `book_orders` وجدول جديد، فمفيش صف قديم بيتغيّر، والستاكات اللي مش عندها
-- `books.courier` بتفضل الأعمدة دي فاضية عندها للأبد.

-- AlterTable
ALTER TABLE "app"."book_orders" ADD COLUMN "courier_sent_at" TIMESTAMP(3),
ADD COLUMN "courier_error" TEXT,
ADD COLUMN "courier_ref" TEXT,
ADD COLUMN "courier_status_id" INTEGER,
ADD COLUMN "courier_status_name" TEXT,
ADD COLUMN "courier_status_note" TEXT,
ADD COLUMN "courier_status_at" TIMESTAMP(3),
ADD COLUMN "courier_agent_name" TEXT,
ADD COLUMN "courier_agent_phone" TEXT;

-- CreateTable
-- مفيش GRANT: `scripts/db-bootstrap.sql` فيه ALTER DEFAULT PRIVILEGES اللي
-- بتدّي رول التطبيق صلاحياته على أي جدول جديد في `app`.
CREATE TABLE "app"."book_order_courier_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status_id" INTEGER NOT NULL,
    "status_name" TEXT NOT NULL,
    "status_note" TEXT,
    "status_date" TEXT,
    "agent_name" TEXT,
    "agent_phone" TEXT,
    "raw" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_order_courier_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_order_courier_events_order_id_fingerprint_key" ON "app"."book_order_courier_events"("order_id", "fingerprint");

-- CreateIndex
CREATE INDEX "book_order_courier_events_order_id_received_at_idx" ON "app"."book_order_courier_events"("order_id", "received_at");

-- AddForeignKey
ALTER TABLE "app"."book_order_courier_events" ADD CONSTRAINT "book_order_courier_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app"."book_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⚠️ الفهرس الجزئي بتاع «إيرادات الكتب» اتبنى على `('paid','shipped','delivered')`
-- بس — يعني طلب في المطبعة كان بيختفي من الإيرادات لحد ما يتشحن (`printing`
-- عمره ما اتضاف للقايمة دي). `BOOK_COUNTED_SQL` اتصلّح، والفهرس لازم يتبني على
-- نفس الشرط بالحرف وإلا الـplanner مش هيستخدمه.
DROP INDEX IF EXISTS "app"."book_orders_paid_at_counted_idx";
CREATE INDEX "book_orders_paid_at_counted_idx"
  ON "app"."book_orders" ("paid_at")
  WHERE "status" IN ('paid', 'printing', 'shipped', 'delivered') AND "deleted_at" IS NULL;
