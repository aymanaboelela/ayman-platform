#!/usr/bin/env bash
#
# ⚠️⚠️ ده **مش** مسار النشر بتاع الإنتاج. متشغّلوش. ⚠️⚠️
#
# `aymanaboelela.com` شغال على **Dokploy** (Docker Compose) — البناء بيحصل
# جوه حاوية من `apps/web/Dockerfile`، اللي بتنتهي بـ
# `CMD ["node", "apps/web/server.js"]` على مخرجات `output: 'standalone'`.
#
# السكريبت ده والـ unit files اللي جنبه (`ayman-web.service` /
# `ayman-api.service`) بيوصفوا تنصيب **systemd قديم** على السيرفر مباشرة —
# `pnpm build` + `systemctl restart`. الاتنين اتساب هنا من قبل ما الستاك
# يتحول لـ Docker.
#
# ليه ده مهم: السكريبت ده والـ unit بيشغّلوا `next start`، وNext نفسه بيقول
# إن `next start` **مش بيشتغل** مع `output: 'standalone'`. يعني اللي مكتوب
# هنا مش بس مسار تاني — هو مسار متعارض مع إعدادات الريبو الحالية.
#
# النشر الصح موصوف في `docs/runbooks/deploy.md`.
#
#   ./deploy/deploy.sh   ← تاريخي فقط
#
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▸ ١/٦  جايب آخر كود"
git pull --ff-only

echo "▸ ٢/٦  بيثبّت الحزم"
pnpm install --frozen-lockfile

echo "▸ ٣/٦  بيطبّق الميجريشن"
# `migrate deploy` مش `migrate dev`: بيطبّق الموجود بس، مش بيولّد ولا
# بيسأل ولا بيعيد تهيئة الداتابيز لو لقى اختلاف.
pnpm --filter @ayman/api exec prisma migrate deploy
pnpm --filter @ayman/api exec prisma generate

echo "▸ ٤/٦  بيبني الـ API"
pnpm --filter @ayman/api run build

# ⚠️ ترتيب مقصود: بناء الويب بيقرا الكتالوج من الـ API وهو شغّال
# (prerender لصفحات الكورسات). لو الـ API واقع، البناء بيقع بـ ECONNREFUSED
# على /courses/[slug]. فالـ API بيترستارت الأول.
echo "▸ ٥/٦  بيعيد تشغيل الـ API، وبيستنى يبقى جاهز"
sudo systemctl restart ayman-api

for i in $(seq 1 30); do
	if curl -fsS -o /dev/null http://127.0.0.1:3300/api/health; then
		echo "   الـ API جاهز"
		break
	fi
	if [ "$i" -eq 30 ]; then
		echo "   ✗ الـ API مردّش خلال ٣٠ ثانية — الـ deploy وقف."
		echo "     شوف: journalctl -u ayman-api -n 50 --no-pager"
		exit 1
	fi
	sleep 1
done

echo "▸ ٦/٦  بيبني الويب وبيعيد تشغيله"
pnpm --filter @ayman/web run build
sudo systemctl restart ayman-web

echo
echo "✓ خلص. للتأكد:"
echo "   curl -fsS https://aymanaboelela.com/api/health"
echo "   systemctl status ayman-api ayman-web"
