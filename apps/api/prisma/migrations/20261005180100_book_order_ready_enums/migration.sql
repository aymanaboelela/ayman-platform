-- «خلصت الطباعة وجاهز» و«اتبعت لشركة الشحن» — محطتين بين «راح للمطبعة»
-- و«اتشحن».
--
-- «اتشحن» بقى معناه إن شركة الشحن **استلمت** الكرتونة فعلًا، وده بيوصل من
-- الـwebhook بتاعها، مش من زرار. فاللي قبله محتاج اسمين: الكتاب خلص طباعة
-- ومستني (`ready`)، والبيانات اتبعتت لسيستم الشحن ومستنيين المندوب ييجي
-- (`courier`). من غيرهم تبويب «المطبعة» كان هيفضل شايل كتب خلصت من أسبوع.
--
-- ملف لوحده لنفس السبب اللي في `20260916000000_book_order_printing_enum`:
-- Postgres ما بيسمحش تستخدم قيمة enum في نفس الـtransaction اللي ضافتها، والـ
-- CHECK اللي بيستخدمها في الملف اللي بعده.

ALTER TYPE "app"."book_order_status" ADD VALUE IF NOT EXISTS 'ready' AFTER 'printing';
ALTER TYPE "app"."book_order_status" ADD VALUE IF NOT EXISTS 'courier' AFTER 'ready';
