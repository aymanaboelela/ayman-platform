# اللينك اللي بيتحط في البايو

الصفحة عايشة على **`https://aymanaboelela.com/links`**.

دي اللينك اللي المفروض يتحط في بايو اليوتيوب والفيسبوك والإنستجرام والتيك توك.
شغّالة من غير أي إعداد زيادة: بتتبني وبتتنشر مع أي merge على `main` زي أي صفحة
تانية، والـ HTTPS بتاعها هو نفس شهادة الدومين الأساسي.

للتأكد إنها شغّالة على الإنتاج:

```bash
node deploy/cloudflare/verify-links-host.mjs
```

---

## لو عايز `links.aymanaboelela.com` كمان

مش مطلوب، ورأيي إنه أوحش من اللي فوق: الاسم هو اللي الناس فاكراها، و
`aymanaboelela.com/links` بيبدأ بالاسم، بينما `links.aymanaboelela.com` بيدفن
الاسم ورا كلمة `links`. ولو حصل، خليه **يوجّه** على الصفحة مش يستضيفها — عشان
تفضل نسخة واحدة في الفهرس بدل اتنين بيتنافسوا.

الخطوات دي في لوحة Cloudflare، ومحتاجة حسابك — مفيش أي توكن محفوظ في الريبو ولا
على الجهاز، وسجّلنا قبل كده إن الـ API بتاع مرحلة `dynamic_redirect` رفض كل
مجموعات الصلاحيات اللي جرّبناها، واللوحة خلّصت الموضوع في دقيقتين.

**1 · DNS**
`DNS → Records → Add record`

| الحقل | القيمة |
| --- | --- |
| Type | `CNAME` |
| Name | `links` |
| Target | `aymanaboelela.com` |
| Proxy status | **Proxied** (السحابة برتقالي) |

**2 · Redirect Rule**
`Rules → Redirect Rules → Create rule`

- **If** — Custom filter expression:
  ```
  (http.host eq "links.aymanaboelela.com")
  ```
- **Then** — Static redirect:
  - URL: `https://aymanaboelela.com/links`
  - Status: `301`
  - Preserve query string: **off**

**3 · التأكيد**

```bash
node deploy/cloudflare/verify-links-host.mjs --host links.aymanaboelela.com
```

⚠️ متكتفيش بـ 200. سجل DNS **مش** مسار: يوم ٣ أغسطس ٢٠٢٦ اتعمل سجل لـ `www` من
غير مسار، وكل الروابط رجّعت 404 نصّي من Traefik — ما عدا `/robots.txt`، اللي
رجّعت **200** بملف robots بتاع Cloudflare نفسها، من غير سطر `Sitemap:` ومن غير
أي `Disallow` من بتوع المنصة. السكربت اللي فوق بيقرا **جسم** الرد وبيدوّر على
سطر `Content-Signal` اللي محدش بيكتبه غير التطبيق ده، عشان ده بالظبط اللي بيتفات.

⚠️ الـ HSTS بتاعنا `includeSubDomains; preload`. يعني أي subdomain جديد لازم
يشتغل HTTPS من أول طلب؛ لو رد مرة على HTTP عادي، المتصفحات هترفضه بعد كده.
Universal SSL بتغطي `*.aymanaboelela.com` مستوى واحد بس — `links.` تمام،
`a.b.aymanaboelela.com` لأ.

---

## حاجات مقصودة في الصفحة

- **مفيش نav ومفيش footer.** الصفحة في مجموعة `(link)` لوحدها بدل `(site)`،
  عشان الـ footer بيعرض نفس أيقونات السوشيال اللي الصفحة كلها مبنية عليها،
  وعشان `SplashCursor` (WebGL) و Lenis مايتحمّلوش على أول صفحة بيشوفها حد جاي
  من وصف فيديو على بيانات موبايل.
- **الصفحة غامقة في الثيمين.** مش بتتبع `data-theme` بالمرة — ألوان يوتيوب
  وواتساب وإنستجرام بتبان على الغامق وبتبهت على الفاتح.
- **اللينكات بتتقري من `/admin/settings` الأول**، والثوابت في
  `packages/contracts/src/site-profiles.ts` هي البديل لو الإعداد فاضي. يعني لو
  غيّرت أي حساب من لوحة الأدمن، الصفحة بتتغير من غير أي نشر.
- **الجروبات (فيسبوك/واتساب) والتيليجرام مش ظاهرين** لأن الريبو مايعرفش
  لينكاتهم. أول ما تكتبهم في `/admin/settings` هيظهروا لوحدهم. مفيش أي لينك
  بيتخمّن.
- **`/links` مضافة في `.github/workflows/uptime.yml`** — دي اللينك الوحيدة اللي
  لو وقعت، كل حسابات السوشيال بتبقى بتوجّه على حاجة ميتة.
