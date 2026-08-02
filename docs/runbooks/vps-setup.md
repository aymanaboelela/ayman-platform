# تجهيز السيرفر — aymanaboelela.com

خطوات مرة واحدة، بالترتيب. لكل خطوة **تأكيد** — متعدّيش خطوة قبل ما تأكيدها ينجح.

الملفات كلها في [`deploy/`](../../deploy/).

---

## قبل ما تبدأ — ٣ حاجات لازم تعرفها

**١. الدومين لوحده مش بيشغّل حاجة.** Cloudflare عندك دلوقتي DNS بس. لازم VPS
حقيقي تشتغل عليه العمليتين + Postgres + Redis.

**٢. الملفات المرفوعة لازم على دومين تاني.** `media.aymanaboelela.com`. مش
تفضيل — الـ API **بيرفض يقلع** لو `MEDIA_BASE_URL` طلع نفس أصل `APP_URL`،
لأن ملف HTML مرفوع على نفس الأصل بيبقى XSS مهما عملت في الـ CSP.

**٣. Cloudflare بيقطع الرفع عند ١٠٠ ميجا — والترقية لـ Pro مش بتحلّها.**

المنصة بتقبل مستندات لحد ٢٠٠ ميجا (`MAX_DOCUMENT_BYTES` في
`packages/contracts/src/admin/media.ts`). الحدود الرسمية
([التوثيق](https://developers.cloudflare.com/workers/platform/limits/)):

| الخطة | أقصى حجم رفع |
|---|---|
| Free | **١٠٠ ميجا** |
| Pro | **١٠٠ ميجا** ← الترقية لـ Pro **مش** بتغيّر حاجة |
| Business | ٢٠٠ ميجا |
| Enterprise | ٥٠٠ ميجا |

أي رفع أكبر من الحد بيترد بـ **413 Request entity too large** — **من
Cloudflare**، قبل ما يوصل للسيرفر. يعني الأدمن هيشوف خطأ مش من المنصة،
ومش هيبان في لوج السيرفر أصلًا. ده أسوأ جزء فيها: مفيش أثر تدوّر عليه.

**✅ اتحلّت في الكود.** حد المنصة نزل لـ **٩٥ ميجا**
(`MAX_DOCUMENT_BYTES`) عشان يقع تحت حد Cloudflare. يعني الرفض بيجي من
المنصة برسالة عربية مفهومة، مش ٤١٣ غامضة من Cloudflare. مش محتاج تعمل حاجة.

ولو احتجت أكبر من ٩٥ ميجا بعدين:

- **سيب `media.aymanaboelela.com` من غير proxy (سحابة رمادية)** — الرفع بيعدّي
  للسيرفر مباشرة من غير حد. بس دومين الملفات ساعتها بيفقد حماية Cloudflare
  و**IP السيرفر بيبقى مكشوف** عليه.
- **Business** لو فعلاً محتاج ٢٠٠ ميجا كاملة.

---

## ١. السيرفر

أي VPS بـ **٢ جيجا رام على الأقل** (البناء بياخد أكتر من ١ جيجا). Ubuntu 24.04.

```bash
ssh root@SERVER_IP

apt update && apt upgrade -y
apt install -y curl git postgresql redis-server ufw

# Node 24 + pnpm
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
npm install -g pnpm@11.17.0

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

**الجدار الناري — اقفله قبل أي حاجة تانية:**

```bash
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw --force enable
```

**تأكيد:** `ufw status` لازم يبقى `active`، و**مفيش** ٥٤٣٢ ولا ٦٣٧٩ ولا ٣٢٠٠
ولا ٣٣٠٠ مفتوحين. دول لازم يفضلوا على `127.0.0.1` بس.

```bash
node --version   # v24.x
pnpm --version   # 11.17.0
```

---

## ٢. يوزر الخدمة والمجلدات

```bash
adduser --system --group --home /srv/ayman --shell /bin/bash ayman
mkdir -p /var/lib/ayman/media
chown -R ayman:ayman /var/lib/ayman /srv/ayman
```

---

## ٣. الكود

```bash
sudo -u ayman -H bash
cd /srv/ayman
git clone https://github.com/aymanaboelela/ayman-platform.git .
pnpm install --frozen-lockfile
exit
```

---

## ٤. الداتابيز

⚠️ الباسوردات اللي في `scripts/db-bootstrap.sql` **للتطوير المحلي بس** ومكتوبة
صريحة عن قصد. غيّرها قبل ما تشغّل الملف.

```bash
# ولّد باسوردين قويين واحتفظ بيهم
openssl rand -base64 32   # لـ ayman_owner
openssl rand -base64 32   # لـ ayman_runtime

sudo -u postgres psql -f /srv/ayman/scripts/db-bootstrap.sql
```

**التأكيد الأهم في الملف كله** — الدور المحدود لازم **يفشل**:

```bash
psql "postgresql://ayman_runtime:PASSWORD@127.0.0.1:5432/ayman_platform" \
  -c "CREATE TABLE app.x (id int);"
```

لازم يرد `ERROR: permission denied for schema app`.

**لو الأمر ده نجح، وقف.** ده الضابط اللي بيمنع أي ثغرة SQL من إنها تعدّل بنية
الداتابيز أو تعمل دالة خبيثة. متكمّلش من غيره.

---

## ٥. المتغيرات

```bash
cp /srv/ayman/deploy/.env.production.example /srv/ayman/.env
chown ayman:ayman /srv/ayman/.env
chmod 600 /srv/ayman/.env
nano /srv/ayman/.env      # غيّر كل CHANGE_ME

openssl rand -base64 48   # لـ BETTER_AUTH_SECRET
```

**تأكيد:** `grep -c CHANGE_ME /srv/ayman/.env` لازم يرد **0**.

---

## ٦. Cloudflare — DNS

في لوحة Cloudflare، تبويب **DNS**:

| النوع | الاسم | القيمة | Proxy |
|---|---|---|---|
| A | `@` | `SERVER_IP` | **رمادي** (مؤقتًا) |
| A | `www` | `SERVER_IP` | **رمادي** (مؤقتًا) |
| A | `media` | `SERVER_IP` | **رمادي** (مؤقتًا) |

**ليه رمادي دلوقتي؟** Caddy هيجيب شهادات Let's Encrypt بتحدي HTTP. التحدي ده
بيبقى أوثق لما Cloudflare مش واقف في النص. هنرجّعه برتقالي في خطوة ٩ بعد ما
الشهادات تنزل.

**تأكيد:** `dig +short aymanaboelela.com` لازم يرد IP السيرفر نفسه.

---

## ٧. Caddy

```bash
cp /srv/ayman/deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

**تأكيد:** `curl -I https://aymanaboelela.com` لازم يرد شهادة صحيحة (٥٠٢ دلوقتي
طبيعي — لسه مفيش حاجة شغالة ورا Caddy).

---

## ٨. أول بناء وتشغيل

```bash
sudo -u ayman -H bash
cd /srv/ayman

pnpm --filter @ayman/api exec prisma migrate deploy
pnpm --filter @ayman/api exec prisma generate
pnpm db:seed
pnpm --filter @ayman/api run build
exit

cp /srv/ayman/deploy/ayman-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ayman-api

curl -fsS http://127.0.0.1:3300/api/health    # لازم: {"status":"ok",...}
```

⚠️ **الـ API لازم يبقى شغّال قبل بناء الويب.** بناء الويب بيعمل prerender
لصفحات الكورسات وبيقرا الكتالوج من الـ API — لو الـ API واقع، البناء بيقع بـ
`ECONNREFUSED` على `/courses/[slug]`.

```bash
sudo -u ayman -H bash -c 'cd /srv/ayman && pnpm --filter @ayman/web run build'
systemctl enable --now ayman-web
```

**تأكيد:**

```bash
systemctl status ayman-api ayman-web     # الاتنين active (running)
curl -fsS https://aymanaboelela.com/api/health
curl -sI https://aymanaboelela.com | head -1
```

### حساب الأدمن

⚠️ **مش `prisma/seed-admin.ts`.** السكربت ده بيرفض يشتغل لما
`NODE_ENV=production` — عن قصد، عشان ميعملش أدمن بباسورد افتراضي متوقّع بره
بيئة الاختبار — وكمان بيزرع كورس ودرس وكويز تجريبيين ملهمش لازمة في كتالوج
حقيقي. السكربت الصح هو `src/scripts/create-admin.ts`، وده اللي بيتبني جوه
`dist/` وبيوصل الصورة.

الباسورد **١٢ حرف على الأقل** (السكربت بيرفض أقل من كده)، والمسافة قبل
الأمر بتمنعه إنه يتسجّل في `~/.bash_history`:

```bash
 API=$(docker ps --format '{{.Names}}' | grep -m1 'ayman-platform.*api')
 docker exec -w /app/apps/api \
   -e ADMIN_EMAIL='...' -e ADMIN_PASSWORD='...' \
   "$API" node dist/scripts/create-admin.js
```

السكربت **idempotent**: تشغيله تاني بيغيّر باسورد الحساب الموجود — وده كمان
طريقة استرجاع أدمن اتقفل عليه.

بيعمل تلات حاجات وبس: يوزر بـ `role: 'admin'`، وحساب `credential` بهاش
Argon2id بنفس معاملات مسار الدخول، و`StudentProfile` بـ
`onboardingCompletedAt`. التالتة دي مش رفاهية — مصفوفة التحويل في
`apps/web/proxy.ts` بتودّي أي جلسة مش مكمّلة onboarding على `/onboarding` في
**كل** مسار محمي، `/admin` من ضمنهم.

---

## ٩. رجّع Cloudflare برتقالي

بعد ما الشهادات نزلت وكل حاجة اشتغلت:

1. **DNS** → حوّل الثلاثة لـ **برتقالي** (Proxied).
   - إلا لو اخترت حل الرفع الكبير من "قبل ما تبدأ" — ساعتها سيب `media` رمادي.
2. **SSL/TLS** → **Full (strict)**. ⚠️ مش "Flexible" — دي بتخلي الرحلة بين
   Cloudflare والسيرفر HTTP عادي.
3. **SSL/TLS → Edge Certificates** → فعّل **Always Use HTTPS**.

**تأكيد بعد ٥ دقايق:**

```bash
curl -sI https://aymanaboelela.com | grep -i "cf-ray\|server"   # لازم يبان cf-ray
curl -fsS https://aymanaboelela.com/api/health
```

وافتح الموقع في المتصفح وسجّل دخول — لو التسجيل نجح يبقى كوكيز `__Host-`
بتعدّي من Cloudflare صح.

---

## ١٠. النسخ الاحتياطي — قبل أول طالب

```bash
mkdir -p /var/backups/ayman && chown ayman:ayman /var/backups/ayman

cat > /etc/cron.daily/ayman-backup <<'SH'
#!/bin/sh
set -e
DAY=$(date +%F)
sudo -u postgres pg_dump ayman_platform | gzip > /var/backups/ayman/db-$DAY.sql.gz
tar czf /var/backups/ayman/media-$DAY.tar.gz -C /var/lib/ayman media
find /var/backups/ayman -type f -mtime +14 -delete
SH
chmod +x /etc/cron.daily/ayman-backup
/etc/cron.daily/ayman-backup      # شغّله مرة دلوقتي
```

**تأكيد:** `ls -lh /var/backups/ayman/` لازم يبان فيه ملفين بحجم منطقي.

⚠️ النسخة على نفس السيرفر **مش نسخة احتياطية**. انقلها برّه (rclone لـ R2 أو
S3) قبل أول طالب حقيقي.

---

## النشر بعد كده

```bash
sudo -u ayman -H bash -c 'cd /srv/ayman && ./deploy/deploy.sh'
```

السكربت بيعمل الترتيب الصح لوحده (ميجريشن ← بناء API ← ريستارت ← **يستنى
الـ health** ← بناء الويب ← ريستارت) وبيقف لو الـ API مردّش.

---

## لو حاجة وقعت

```bash
journalctl -u ayman-api -n 100 --no-pager
journalctl -u ayman-web -n 100 --no-pager
journalctl -u caddy -n 50 --no-pager
```

| العرض | الأغلب إن السبب |
|---|---|
| الـ API بيقع فورًا عند الإقلاع | متغيّر ناقص — اللوج بيطبع كل الناقص مرة واحدة |
| `MEDIA_BASE_URL must be a DIFFERENT origin` | `media.` مش متظبط في `.env` |
| بناء الويب بيقع بـ `ECONNREFUSED` | الـ API مش شغّال — شغّله الأول |
| **٥٢٥** من Cloudflare | السيرفر مش بيرد HTTPS على ٤٤٣ أصلًا — Caddy واقع أو الجدار قافل ٤٤٣ |
| **٥٢٦** من Cloudflare | Caddy بيرد بس الشهادة مش صالحة/موثوقة. الأغلب إنه مجابش شهادة Let's Encrypt وهو برتقالي — رجّع السجل رمادي، استنى الشهادة تنزل (`journalctl -u caddy`)، وبعدين ارجّعه برتقالي |
| **٤١٣** عند رفع ملف كبير | ده من Cloudflare مش من المنصة — شوف "قبل ما تبدأ" فوق |
| الدخول بيرجّعك على طول لصفحة الدخول | الكوكي مش بتتحفظ — اتأكد إن `APP_URL` و`BETTER_AUTH_URL` بـ `https://` وبنفس الدومين |

---

## بعد النشر

شوف [`launch-runbook.md`](launch-runbook.md) — فيه تفعيل الـ CSP (سيبها مراقبة
أسبوع الأول)، وقائمة "قبل أول طالب حقيقي" في [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

**وتذكير مهم:** لو فعّلت الدخول بآبل، الـ `client_secret` بتاعها JWT
**بينتهي كل ٦ شهور**. هيقف فجأة من غير ما يتغيّر كود ومن غير رسالة واضحة. حط
تذكير يتجدّد كل ٥ شهور من تاريخ التفعيل.
