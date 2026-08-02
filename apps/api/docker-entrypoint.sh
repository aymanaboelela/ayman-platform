#!/bin/sh
# بيتشغّل قبل السيرفر في كل إقلاع.
#
# الميجريشن بتتطبّق بـ DIRECT_DATABASE_URL (دور الـ owner) لأنها بتعدّل بنية
# الجداول. السيرفر نفسه بعد كده بيشتغل بـ DATABASE_URL (الدور المحدود) اللي
# مش قادر يعمل كده — وده المقصود.
#
# `migrate deploy` مش `migrate dev`: بيطبّق الملفات الموجودة بس، مش بيولّد
# ولا بيسأل ولا بيعيد تهيئة الداتابيز لو لقى اختلاف.
set -e

echo "entrypoint: applying migrations…"
cd /app
node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "entrypoint: starting api"
cd /app/apps/api
exec node dist/main
