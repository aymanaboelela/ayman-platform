-- ═══════════════════════════════════════════════════════════════════════════
-- «راح للمطبعة إمتى، ومين بعتّه» — العمودين بتوع المحطة الجديدة.
--
-- بيشتغل بعد `20260916000000_book_order_printing_enum` لأن الـCHECK تحت
-- بيسمّي القيمة اللي الملف ده ضافها، وPostgres ما بيسمحش بكده في نفس
-- الـtransaction — اقرا هيدر الملف ده.
--
-- ## `printed_at` NULLABLE، وNULL معناها «ما راحش للمطبعة»
--
-- مش «مش معروف». نسخة بتتسلّم باليد ما بتعديش على طبعة، و`markShipped` لسه
-- بيقبل `paid` على طول؛ فطلب `shipped` و`printed_at` فاضي ده قراءة صح مش صف
-- ناقص. اختراع وقت طباعة عشان الترتيب يبان كامل هو بالظبط الكذبة اللي
-- `shipped_at` بيرفض يكتبها على الطلب اللي اتسلّم باليد.
--
-- ## `printed_by_user_id` — «مين قال إنه راح للمطبعة»
--
-- نفس سبب `shipped_by_user_id` و`delivered_by_user_id`: أول سؤال يوم ما
-- الطبعة ترجع ناقصة. `ON DELETE SET NULL` — مسح حساب إداري ما يمسحش تاريخ طرد.
--
-- ## الـCHECK: الحالة والوقت ما يتخانقوش
--
-- طلب `status = 'printing'` لازم يبقى معاه `printed_at`، زي
-- `book_orders_rejected_status_matches` بالظبط. بس العكس مش صحيح وما ينفعش
-- يتقفل: الطلب بيعدّي من `printing` لـ`shipped` وبعدين `delivered` والختم بيفضل
-- مكانه — ده كل فايدته. فالشرط في اتجاه واحد.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "app"."book_orders"
  ADD COLUMN "printed_at"          TIMESTAMP(3),
  ADD COLUMN "printed_by_user_id"  TEXT,
  ADD CONSTRAINT "book_orders_printed_by_user_id_fkey"
    FOREIGN KEY ("printed_by_user_id") REFERENCES "app"."users"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."book_orders"
  ADD CONSTRAINT "book_orders_printing_status_has_a_stamp"
  CHECK ("status" <> 'printing' OR "printed_at" IS NOT NULL);
