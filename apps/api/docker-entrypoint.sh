#!/bin/sh
# بيتشغّل قبل السيرفر في كل إقلاع، وبيعمل حاجتين بالترتيب.
#
# ⚠️ الاتنين بيستخدموا DIRECT_DATABASE_URL (دور الـ owner) لأنهم بيعدّلوا
# البنية والصلاحيات. السيرفر نفسه بعد كده بيشتغل بـ DATABASE_URL — الدور
# المحدود اللي مش قادر يعمل ولا واحدة منهم، وده المقصود.
set -e
cd /app

# ١. دور التشغيل المحدود.
#
# ده كان سكربت متركّب على postgres كـ bind mount، وده كان بيفشل النشر كله في
# ٨ ثواني: Docker بيحاول يركّب مسار نسبي مش موجود من منظوره فيعمله مجلد ويقع
# على "مجلد على ملف". هنا أنضف وأمتن — مفيش mount، وبيتنفّذ في كل إقلاع
# بشكل idempotent بدل مرة واحدة عند تهيئة الـ volume.
#
# ملحوظ: الدور مالوش CREATE. بيقرا ويكتب صفوف وبس — ده الضابط اللي بيمنع أي
# ثغرة SQL من إنها تعمل جدول أو دالة.
echo "entrypoint: ensuring the least-privilege runtime role…"
cat > /tmp/roles.sql <<SQL
CREATE SCHEMA IF NOT EXISTS app;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ayman_runtime') THEN
    CREATE ROLE ayman_runtime LOGIN PASSWORD '${RUNTIME_PASSWORD}';
  ELSE
    ALTER ROLE ayman_runtime WITH PASSWORD '${RUNTIME_PASSWORD}';
  END IF;
END
\$\$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA app TO ayman_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ayman_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ayman_runtime;

-- لازم تسبق الميجريشن كمان: من غير السطرين دول أي جدول جديد بيتعمل بعد كده
-- بيبقى غير مقروء للدور المحدود، وبيبان كخطأ صلاحيات بعد أول نشر.
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ayman_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO ayman_runtime;
SQL

node_modules/.bin/prisma db execute \
  --url "$DIRECT_DATABASE_URL" \
  --file /tmp/roles.sql

# ٢. الميجريشن.
#
# `migrate deploy` مش `migrate dev`: بيطبّق الملفات الموجودة بس، مش بيولّد
# ولا بيسأل ولا بيعيد تهيئة الداتابيز لو لقى اختلاف.
echo "entrypoint: applying migrations…"
node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma

# الصلاحيات تاني، بعد الميجريشن: الجداول اللي الميجريشن عملتها دلوقتي محتاجة
# المنح صراحةً — الـ DEFAULT PRIVILEGES فوق بتغطي اللي جاي، مش اللي اتعمل في
# نفس الجلسة دي.
node_modules/.bin/prisma db execute --url "$DIRECT_DATABASE_URL" --stdin <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ayman_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ayman_runtime;
SQL

echo "entrypoint: starting api"
cd /app/apps/api
exec node dist/main
