#!/bin/sh
# بيتشغّل قبل السيرفر في كل إقلاع، وبيعمل حاجتين بالترتيب.
#
# ⚠️ الاتنين بيشتغلوا بصلاحية الـ owner (DIRECT_DATABASE_URL) لأنهم بيعدّلوا
# البنية والصلاحيات. السيرفر نفسه بعد كده بيشتغل بـ DATABASE_URL — الدور
# المحدود اللي مش قادر يعمل ولا واحدة منهم، وده المقصود.
set -e
cd /app

# مع pnpm، أدوات الحزمة بتتحط في node_modules/.bin بتاع الحزمة نفسها مش في
# جذر الـ workspace — و`prisma` هي devDependency لـ apps/api. النداء من الجذر
# كان بيفشل بـ "not found" وبيخلي الحاوية تعيد التشغيل في حلقة.
PRISMA=""
for candidate in /app/apps/api/node_modules/.bin/prisma /app/node_modules/.bin/prisma; do
  if [ -x "$candidate" ]; then PRISMA="$candidate"; break; fi
done
if [ -z "$PRISMA" ]; then
  echo "entrypoint: FATAL — prisma CLI not found in the image" >&2
  exit 1
fi
echo "entrypoint: using $PRISMA"

# ⚠️ كل أوامر prisma بتتشغّل من apps/api. السبب: `prisma db execute` في
# Prisma 7 **مفيهوش** خيار `--url` — بيقرا الرابط من `prisma.config.ts`،
# والملف ده هناك. النداء من الجذر كان بيرد "unknown or unexpected option".
cd /app/apps/api

# ── ١. دور التشغيل المحدود ────────────────────────────────────────────
# بيتنفّذ في كل إقلاع وidempotent. الدور مالوش CREATE: بيقرا ويكتب صفوف وبس —
# ده الضابط اللي بيمنع أي ثغرة SQL من إنها تعمل جدول أو دالة.
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

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ayman_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO ayman_runtime;
SQL

"$PRISMA" db execute --file /tmp/roles.sql

# ── ٢. الميجريشن ──────────────────────────────────────────────────────
# `migrate deploy` مش `migrate dev`: بيطبّق الموجود بس، مش بيولّد ولا بيسأل
# ولا بيعيد تهيئة الداتابيز لو لقى اختلاف.
echo "entrypoint: applying migrations…"
"$PRISMA" migrate deploy

# الصلاحيات تاني بعد الميجريشن: الجداول اللي اتعملت دلوقتي محتاجة المنح
# صراحةً — DEFAULT PRIVILEGES بتغطي اللي جاي، مش اللي اتعمل في نفس الجلسة.
cat > /tmp/grants.sql <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ayman_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ayman_runtime;
SQL
"$PRISMA" db execute --file /tmp/grants.sql

# ── ٣. حساب الأدمن الأولي ─────────────────────────────────────────────
# بيشتغل بس لو المتغيرين موجودين، و`ADMIN_ONLY_IF_MISSING=true` بيخلّيه
# **ميعملش أي حاجة** لو في أدمن أصلاً.
#
# ⚠️ الحارس ده هو اللي بيخلّي وجود ADMIN_PASSWORD في بيئة النشر آمن. من
# غيره كل إعادة تشغيل كانت هتصفّر باسورد الأدمن — فاليوم اللي صاحب المنصة
# يغيّر فيه باسورده من داخل المنتج، أول redeploy بيرجّعه من غير أي رسالة في
# أي مكان، وهو مقفول بره حسابه.
#
# للاسترجاع (تصفير باسورد أدمن موجود) شغّله بإيدك من غير الفلاج ده:
#   docker exec -w /app/apps/api -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… \
#     <api> node dist/scripts/create-admin.js
#
# ⚠️ `|| echo` مقصود، والملف ده شغّال بـ `set -e`. من غيره أي فشل هنا —
# باسورد أقصر من ١٢ حرف، أو جدول المحافظات لسه مش مزروع — كان هيمنع الـ API
# إنه يقلع أصلاً. إن حساب أدمن مااتعملش مشكلة تتصلّح؛ إن الموقع كله يقع
# عشانها مشكلة أكبر بكتير.
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "entrypoint: ensuring the bootstrap admin account…"
  ADMIN_ONLY_IF_MISSING=true node dist/scripts/create-admin.js \
    || echo "entrypoint: WARNING — admin bootstrap failed; the API is starting anyway" >&2
fi

echo "entrypoint: starting api"
exec node dist/main
