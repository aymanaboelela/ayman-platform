-- الواجب — الإشعارين بتوعه.
--
-- `homework_submitted` للأدمن: الطالب سلّم، وده الحاجة الوحيدة اللي هتوصّله
-- إن في حاجة مستنّياه وهو مش فاتح `/admin`. نفس التوزيع بتاع
-- `payment_submitted` و`book_order_placed` — صف لكل حد شايل الصلاحية.
--
-- `homework_reviewed` للطالب: اتصحّح. الكلام نفسه بيتبعت رسالة في محادثته
-- عشان يقدر يرد عليها أو يبعت صوت، والإشعار ده هو اللي بيقوله يفتحها.
--
-- ⚠️ `ALTER TYPE … ADD VALUE` لوحدها في ملف، ومفيش أي INSERT معاها: Postgres
-- بتسمح بيها جوه transaction (وPrisma بتلف كل migration في واحدة) بشرط إن
-- القيمة الجديدة ما تتستخدمش قبل ما الـtransaction دي تكمّت. نفس القاعدة
-- المكتوبة في `20260903160000_admin_notification_kinds`.

ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'homework_submitted';
ALTER TYPE "app"."notification_kind" ADD VALUE IF NOT EXISTS 'homework_reviewed';
