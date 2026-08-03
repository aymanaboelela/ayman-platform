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

ده اتشخّص يوم ٣ أغسطس ٢٠٢٦ بعد ما ٦ ميرجات عدّت والموقع فضل على بناء قديم
بيومين. لو اتظبط webhook بعدين، الملف ده لازم يتحدّث.

## ⚠️ Redeploy مش دايمًا بيسحب كود جديد

أخطر حاجة هنا: النشر ممكن "ينجح" ويبني **نفس الكود القديم**، من غير أي رسالة
خطأ. الشاشة بتقول succeeded وإنت لسه على نفس البناء.

الدليل إن ده بيحصل — مفتاح الـ deploy على GitHub بيسجّل آخر استخدام:

```
$ gh api repos/aymanaboelela/ayman-platform/keys \
    --jq '.[] | "\(.title) — last_used \(.last_used)"'
Dokploy deploy key (read-only) — last_used 2026-08-02T14:43:06Z
```

لو التاريخ ده **ما اتحركش** بعد ما دُست Redeploy، يبقى Dokploy ما عملش fetch
من GitHub أصلًا.

**متثقش في "succeeded" — اتأكد من الموقع نفسه.**

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
