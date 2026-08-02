# كاش Next على Redis — التصميم

**التاريخ:** 2026-08-03
**النطاق:** `apps/web` فقط. الـ API مش بيتغيّر.

## المشكلة

الويب عنده معمارية كاش كاملة بالفعل: `cacheComponents: true` في `next.config.ts`،
و`'use cache'` + `cacheTag`/`cacheLife` في `lib/settings.ts` و`lib/catalog.ts`
و`lib/home-blocks.ts` و`lib/shiki.ts`، وإبطال منضبط بـ `updateTag()` في كل
server action تحت `app/(admin)/`، بمفردات أختام موحّدة في `lib/cache-tags.ts`.

الناقص هو **التخزين**. الـ handler الافتراضي في Next 16 كله في ذاكرة العملية
(`dist/server/lib/cache-handlers/default.js` — `LRUCache` جوّه الموديول). يترتب على ده:

1. كل نشرة أو إعادة تشغيل بتصفّي الكاش بالكامل. `getBranding()` بتتقرا في
   الـ root layout يعني على مسار **كل صفحة**، فأول زائر بعد كل نشرة بيدفع تمن
   كل نداء API من الأول.
2. `updateTag()` بتعدّل `tagsManifest` — وهي `Map` جوّه العملية. بنسخة ويب واحدة
   ده صح؛ بنسختين، الأدمن بيحفظ فيتبطّل الكاش في نسخة واحدة بس والتانية تفضل
   بتقدّم القديم لحد ما `cacheLife` يخلص.
3. الكاش في الذاكرة **بيرفض** دلالات stale-while-revalidate عن قصد.

`.env.example` مكتوب فيه `# redis (throttler + cache handler)` — الـ handler ده
كان منوي من الأول واتساب.

## القرار

نكتب `CacheHandler` مخصص مدعوم بـ Redis، بطبقتين: ذاكرة قدّام Redis.

### ليه مش حزمة جاهزة

الحزم المتداولة (`@neshca/cache-handler` وفروعها) مبنية على واجهة الـ ISR
handler القديمة (`cacheHandler` المفرد، بـ `get/set/revalidateTag`). Next 16.2.11
عنده واجهة تانية خالص لـ `'use cache'` — `cacheHandlers` بالجمع، بخمس دوال:
`get / set / refreshTags / getExpiration / updateTags`. تبنّي حزمة على الواجهة
الغلط أسوأ من كتابة ملف واحد بنفهمه.

### ليه بطبقتين مش Redis صافي

`getExpiration(tags)` بيتنده عليها لكل مجموعة أختام في كل طلب، و`refreshTags()`
قبل كل طلب. لو دول رحلات شبكة، مسار الـ root layout بيتحمّل رحلتين على الأقل
في كل صفحة. الطبقة الأولى بتخلي القراءة المتكررة من الذاكرة زي ما هي دلوقتي،
وRedis بيبقى شبكة أمان بعد النشر مش عقبة في المسار الساخن.

## الترقية الحقيقية: stale-while-revalidate

تعليق Next على الـ handler الافتراضي، حرفياً:

> In-memory caches are fragile and should not use stale-while-revalidate
> semantics on the caches because it's not worth warming up an entry that's
> likely going to get evicted before we get to use it anyway.

وعشان كده `default.js` بيرمي المُدخل بمجرد ما يعدّي `revalidate`:

```js
if (now > entry.timestamp + entry.revalidate * 1000) return undefined
```

المُدخل ده عنده حقل تاني اسمه `expire` — أطول من `revalidate` — وبيتباع
للتخزين وبيتجاهله الافتراضي تماماً. كاش **دائم** مش هش، فالقاعدة دي مش
بتنطبق عليه:

| الحالة | الافتراضي (ذاكرة) | ده (Redis) |
|---|---|---|
| `age ≤ revalidate` | يرجّع المُدخل | يرجّع المُدخل |
| `revalidate < age ≤ expire` | **يرمي** — miss | يرجّع المُدخل بـ `revalidate: -1` → يقدّم قديم ويجدّد في الخلفية |
| `age > expire` | يرمي | يرمي |

يعني في النافذة بين `revalidate` و`expire` الزائر بياخد رد فوري من الكاش
والتجديد بيحصل وراه، بدل ما يستنى نداء API. ده مكسب في كل طلب، مش بعد النشر بس.

## الحدود

ملف واحد: `apps/web/cache-handler/redis.js`. بيصدّر كائن بالخمس دوال بالظبط.

الملف **مش** بيعرف حاجة عن المنصة — لا أختام ولا إعدادات ولا كتالوج. بياخد
مفتاح ويرجّع بايتات. مفردات الأختام فاضلة كلها في `lib/cache-tags.ts` ومحدش
بيلمسها. عشان كده الـ handler بيتختبر لوحده بعميل Redis مزيّف، من غير ما
يقلّع Next.

`.js` مش `.ts` لأن Next بيحمّله وقت التشغيل بـ `await import(fileURL)` من غير
أي تحويل — لازم يبقى JavaScript صالح للتنفيذ. الأنواع بتتوثّق بـ JSDoc.
الحزمة `"type": "module"` فالملف ESM بـ `export default`.

### تخطيط مفاتيح Redis

| المفتاح | النوع | المحتوى | العمر |
|---|---|---|---|
| `next:cache:<cacheKey>` | string (ثنائي) | إطار: 4 بايت طول الترويسة + ترويسة JSON + الحمولة | `expire` ثانية |
| `next:tags` | hash | حقل = ختم، قيمة = `{"expired":ms,"stale":ms}` | دائم |

إطار واحد في مفتاح واحد يعني رحلة واحدة للقراءة ورحلة واحدة للكتابة.
هاش واحد للأختام يعني `HGETALL` واحد في `refreshTags()` بدل مسح المساحة.

مفردات الأختام محدودة بـ `cache-tags.ts` (`settings:*`، `flags`، `nav`،
`home-blocks`، `taxonomy`، `course`، `course:<uuid>`) — يعني الهاش بيكبر بعدد
الكورسات مش بعدد الطلبات. مفيش تقليم مطلوب.

### دلالات الأختام

منقولة حرف بحرف من `tags-manifest.external.js` عشان السلوك يفضل واحد:

- `expired`: المُدخل بايت لو `expiredAt <= now && expiredAt > entry.timestamp`.
- `stale`: المُدخل قديم لو `staleAt > entry.timestamp` → `revalidate = -1`.
- `updateTags(tags)` من غير `durations` → `{expired: now}`.
- `updateTags(tags, {expire})` → `{stale: now, expired: now + expire*1000}`.

`updateTags` بتكتب في Redis **و** في الخريطة المحلية في نفس اللحظة. ده اللي
بيخلي الأدمن يقرا كتابته هو — نفس السبب اللي خلّى الكود كله يستخدم
`updateTag` مش `revalidateTag`.

## السلوك وقت العطل — يفشل مفتوح

`redis.module.ts` في الـ API **بيفشل مقفول** عن قصد: Redis واقع → 500. ده صح
لحدود الطلبات، لأن حد طلبات مش شغّال يعني مفيش حد أصلاً.

الكاش بيعمل العكس بالظبط. أي خطأ من Redis بيتبلع والـ handler بيرجع يشتغل
بالذاكرة بس. **Redis واقع يعني الكاش أبطأ، مش الموقع واقع.** لو الاتنين
اتعاملوا بنفس المنطق يبقى Redis بقى نقطة فشل واحدة للمنصة كلها.

نتيجة عملية: `client.on('error', …)` **لازم** يتسجّل. حدث `error` من ioredis
من غير مستمع بيوقّع العملية كلها.

### وقت البناء

`next build` بيولّد `/_not-found` مسبقاً، واللي بيمر على الـ root layout،
واللي بينده `getBranding()` — يعني الكاش شغّال جوّه `docker build`، حيث مفيش
Redis.

الـ handler بيقرا `process.env.REDIS_URL`؛ لو مش موجود، مبيعملش عميل خالص
ويشتغل بالذاكرة. و`apps/web/Dockerfile` بيمرّر `NEXT_PUBLIC_*` بس كـ build
args، فـ `REDIS_URL` **مش** موجود وقت البناء بالتعريف. مفيش عميل، مفيش سوكيت
مفتوح يمنع البناء إنه يخلص.

ده نفس منطق التسامح الموجود في `getBranding()` بالظبط، ولنفس السبب الحرفي.

## التوصيل

1. `apps/web/package.json` ← `ioredis` (نفس نسخة الـ API، `5.11.1`).
2. `next.config.ts` ← `cacheHandlers: { default: … }` — أعلى مستوى، مش تحت
   `experimental` (النسخة اللي تحت `experimental` معلّمة `@deprecated` في
   `config-shared.d.ts:296`).
3. `docker-compose.yml` ← خدمة `web` تاخد `REDIS_URL` و`depends_on: redis`.
4. `apps/web/package.json` سكربت `lint` ← إضافة `cache-handler`.

### التتبّع في الـ standalone

`collect-build-traces.js:161` بيضيف قيم `cacheHandlers` لمُدخلات التتبّع،
يعني الملف وتبعياته (`ioredis`) بيتنسخوا في `.next/standalone` تلقائياً.
مفيش حاجة لـ `outputFileTracingIncludes` — لكن دي نقطة **تحقق**، مش افتراض:
لازم نتأكد من وجود الملف في المخرجات بعد بناء حقيقي.

المسار بيتخزّن نسبةً لـ `distDir` وقت البناء (`build/index.js:1001`) وبيتحل
وقت التشغيل بـ `formatDynamicImportPath(distDir, handler)` — فالمسار المطلق
بتاع وقت البناء مش بيتسرّب للحاوية.

## الاختبارات

`apps/web/cache-handler/redis.test.ts` بـ vitest، بعميل Redis مزيّف في الذاكرة
وساعة محقونة. اللي بيتغطّي:

- ذهاب وعودة: `set` ثم `get` بيرجّع نفس البايتات.
- إصابة الذاكرة من غير ما تلمس Redis.
- إصابة Redis بعد تفريغ الذاكرة (محاكاة إعادة التشغيل).
- `age > expire` → miss.
- `revalidate < age ≤ expire` → إصابة بـ `revalidate: -1` (السلوك الجديد).
- `updateTags` بيبطّل المُدخلات الأقدم من الختم بس.
- `getExpiration` بيرجّع أكبر طابع، و`0` للأختام اللي عمرها ما اتبطّلت.
- `refreshTags` بيسحب إبطال اتكتب من "نسخة تانية".
- كل عملية Redis بترمي → القراءات والكتابات تفضل شغّالة من الذاكرة.
- `set` بيستنى المعلّق: `get` أثناء `set` جارٍ مبيرجّعش `undefined`.

## اللي مش داخل النطاق

- **كاش على مستوى الـ API.** الـ API بيتنده عليه من ورا كاش ويب مدته ساعات؛
  طبقة تانية تحته مكسبها قليل وبتضيف مصدر تاني للبيانات البايتة.
- **الكاش الثابت/ISR.** مع `cacheComponents` القشور المولّدة مسبقاً هي مخرجات
  بناء، ثابتة لكل نشرة. Redis مش بيضيف لها حاجة.
- **`remote` و`static` handlers.** `default` بس.

## الحد المعروف

فيه **نسخة ويب واحدة** في `docker-compose.yml`. يعني:

- مكسب أكيد النهاردة: نجاة الكاش من النشر، و stale-while-revalidate في كل طلب.
- مكسب `updateTag` عبر النسخ: **شرط مسبق** لليوم اللي تتشغّل فيه نسخة تانية،
  مش مكسب حالي.
