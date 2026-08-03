# النشر — aymanaboelela.com

## المسار الصح

الإنتاج شغال على **Dokploy** (Docker Compose) على VPS. البناء بيحصل **جوه
حاوية** من `apps/web/Dockerfile` و `apps/api/Dockerfile`، مش على السيرفر
مباشرة.

**عشان تنشر:** لوحة Dokploy → التطبيق → **Redeploy**.

## ⚠️ مفيش نشر تلقائي

الريبو عليه **صفر webhooks**. Dokploy عنده deploy key (read-only) يقرا بيه،
بس محدش بيقوله إن فيه push جديد — فأي merge على `main` **مش** بيعمل حاجة
لوحده.

```
$ gh api repos/aymanaboelela/ayman-platform/hooks --jq 'length'
0
```

ده اتشخّص يوم ٣ أغسطس ٢٠٢٦: ٦ ميرجات نزلت على `main` والموقع فضل على البناء
اللي قبلهم لحد ما حد دخل اللوحة ودَس Redeploy بإيده. مفيش رسالة خطأ في أي
مكان، لأن مفيش حاجة اتطلب منها تشتغل أصلًا.

لو اتظبط webhook بعدين، الملف ده لازم يتحدّث.

## ⚠️ متستخدمش `last_used` بتاع الـ deploy key كمؤشر

فيه إغراء إنك تتأكد إن Dokploy سحب الكود عن طريق:

```
$ gh api repos/aymanaboelela/ayman-platform/keys --jq '.[].last_used'
```

**الرقم ده كذّاب.** مقيس يوم ٣ أغسطس ٢٠٢٦: تبويب Deployments بيقول إن آخر
نشرة نزّلت commit `2e1fe1b` (من نفس اليوم الساعة ٧:٠٩ م) ونجحت في ٢ دقيقة
و١٨ ثانية — وفي نفس اللحظة `last_used` لسه واقف على `2026-08-02T14:43:06Z`،
يعني متأخر أكتر من يوم.

GitHub بيحدّث الحقل ده بتكاسل. لو بنيت عليه استنتاج، هتقول "Dokploy ما سحبش
الكود" وهو ساحبه وناشره فعلًا.

**المصدر الصح: تبويب Deployments في اللوحة** — بيوري الـ commit hash بتاع كل
نشرة وحالتها ومدتها. قارن الـ hash ده بـ `git rev-parse origin/main`.

## التأكد إن النشرة نزلت فعلًا

ابص على حاجة **اتغيرت في النشرة دي بالذات**، مش على إن الموقع بيرد 200.
الأيقونات كويسة كعلامة لأن Next بيحط hash في الـ URL بيتغير مع كل بناء:

```bash
curl -sS https://aymanaboelela.com/ | grep -oE '<link[^>]*rel="icon"[^>]*>'
```

وللتأكد إن الأصول نفسها بتتخدم:

```bash
for u in /icon.png /apple-icon.png /manifest.webmanifest; do
  printf '%-24s ' "$u"
  curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "https://aymanaboelela.com$u"
done
```

⚠️ الـ 404 لثواني وقت النشر **طبيعي** — دي الحاوية القديمة وقفت والجديدة لسه
بتقوم. لو فضل أكتر من دقيقة، يبقى البناء وقع.

⚠️ Cloudflare بيفلتر على حسب الـ User-Agent، وده **مش** بيطبّق على كل
السكريبتات — مقيس يوم ٣ أغسطس ٢٠٢٦ على نفس الصفحة في نفس اللحظة:

| الأداة | النتيجة |
|---|---|
| `curl` بالـ UA الافتراضي | **200** |
| `urllib` بتاع بايثون بالـ UA الافتراضي | **403** |

يعني `curl` كفاية للفحص، لكن أي حاجة مكتوبة بـ `urllib` لازم تبعت User-Agent
بتاع متصفح — وإلا هتقرا 403 من Cloudflare وتفتكر إن الموقع واقع وهو شغال.

## لو النشر فشل

أشهر سبب متوقع: **الرام**. `pnpm --filter @ayman/web run build` بياخد فوق
١ جيجا، وبيتنفذ على نفس السيرفر اللي شايل Postgres و Redis و الـ API واللوحة.
`exit code 137` أو `Killed` في اللوج معناها كده — مش مشكلة كود.

الحلول بالترتيب: swap على السيرفر ← VPS أكبر ← تبني الصورة في CI وDokploy
يسحبها جاهزة (ده بيشيل البناء من على سيرفر الإنتاج خالص).

## اللي **مش** مسار نشر

`deploy/deploy.sh` و `deploy/ayman-web.service` و `deploy/ayman-api.service`
تنصيب **systemd قديم** من قبل ما الستاك يتحوّل لـ Docker. متشغّلهمش.

وفيه سبب أقوى من إنهم قدام: بيشغّلوا `next start`، وNext بيطلّع تحذير صريح إن
`next start` مش بيشتغل مع `output: 'standalone'` — وهو الإعداد اللي في
`apps/web/next.config.ts` دلوقتي. يعني المسار القديم مش بس مختلف، هو متعارض.
