# syntax=docker/dockerfile:1
# ⚠️ السطر اللي فوق ده لازم يفضل أول سطر في الملف حرفيًا. Docker بيبطّل يقرا
# التوجيهات دي أول ما يشوف أي تعليق أو أمر قبلها، وساعتها `RUN --mount` تحت
# بيفشل بخطأ في القراءة مش بخطأ في البناء.
#
# الويب — Next.js
#
# البناء بيحصل هنا من غير API شغّال، وده مقصود: `generateStaticParams`
# و`sitemap.ts` بيستخدموا `getCatalogOrEmpty` اللي بيرجّع قايمة فاضية بدل ما
# يرمي خطأ. النتيجة إن البناء بينجح ومفيش صفحة كورس متولّدة مسبقًا — وده صح،
# الصفحات بتتولّد وقت الطلب. قبل التعديل ده كان `next build` بيقع بـ
# ECONNREFUSED جوه docker build، وهي حالة مستحيل ترضيها أصلًا.

FROM node:24-slim AS base
# مخزن pnpm بيقع تحت PNPM_HOME. اتحدد صراحةً هنا عشان الـ cache mount تحت
# يبقى ليه مكان ثابت يركب عليه — من غيره المخزن بيقع جوه ~/.local/share
# ومحدش يقدر يوصله من طبقة تانية.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json           apps/api/
COPY apps/web/package.json           apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json        packages/ui/
COPY packages/config/package.json    packages/config/
# ⚠️ الـ cache mount ده بيوفّر التنزيل، مش الربط.
#
# طبقة الـ deps فيها كاش طبقات أصلًا — طول ما القفل ماتغيّرش الطبقة بتتاخد
# جاهزة. المشكلة إن أي تعديل في أي `package.json` بيبطّلها، وساعتها pnpm
# بينزّل الحزم كلها من الأول. الـ mount بيخلّي المخزن باقي بين البناءات فبيقرا
# من على القرص بدل الشبكة.
#
# المخزن على نظام ملفات مختلف عن node_modules، فـ pnpm هينسخ بدل ما يعمل
# hardlink — أبطأ من الربط وأسرع بكتير من التنزيل. ده الثمن وهو مقبول.
#
# ⚠️ مالوش أي فايدة في CI. الـ cache mount محلي للباني، وباني GitHub Actions
# بيتولد من جديد كل مرة — الفايدة كلها على السيرفر، اللي الباني بتاعه باقي بين
# النشرات. مقصود إنه من غير `cache-to`؛ اتقاس إن رفع الكاش لـ GitHub بيكلّف
# أكتر من اللي بيوفّره (شوف الـ job في ci.yml).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# ⚠️ متغيرات NEXT_PUBLIC_* بتتحرق جوه الـ bundle وقت البناء، مش وقت التشغيل.
# يعني تغييرها في Dokploy بعد كده **مش** هيأثر — لازم إعادة بناء. عشان كده
# هما build args هنا مش environment بس.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MEDIA_ORIGIN
# معرّف مشروع Microsoft Clarity. مش سر — بيتبعت جوه رابط الـ tag في HTML كل
# زائر — بس لازم يكون موجود وقت **البناء**، زي إخواته فوق: لو فاضي، الـ tag
# ما بيتشحنش خالص، وضبطه في Dokploy بعد كده ما بيرجّعوش من غير إعادة بناء.
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MEDIA_ORIGIN=$NEXT_PUBLIC_MEDIA_ORIGIN
ENV NEXT_PUBLIC_CLARITY_PROJECT_ID=$NEXT_PUBLIC_CLARITY_PROJECT_ID
ENV NEXT_TELEMETRY_DISABLED=1

# ⚠️ `.next/cache` بيتركب كـ cache mount، مش بيتنسخ في طبقة.
#
# ده المكان اللي Next بيحط فيه كاش الـ compiler وكاش الصور المحسّنة. جوه
# `docker build` هو بيبدأ فاضي في كل نشرة، فكل بناء بيترجم المشروع كله من
# الصفر حتى لو اللي اتغيّر سطر واحد. الـ mount بيخلّيه باقي بين النشرات على
# السيرفر فالبناء بيبقى تزايدي.
#
# ⚠️ لازم يبقى `--mount` مش `VOLUME` ولا مجلد عادي: الـ mount مش بيدخل الصورة
# النهائية أصلًا، وده المطلوب — `output: standalone` مابياخدش `.next/cache`
# معاه وقت التشغيل، فلو دخل الصورة يبقى ميجابايتات بتتشحن على الفاضي.
#
# لو ظهر يوم بناء بيدّي نتيجة غلط ومحدش عارف ليه، ده أول مشتبه فيه: امسح كاش
# الباني على السيرفر بـ `docker builder prune` واتأكد إن الغلط اختفى قبل ما
# تدوّر في الكود.
RUN --mount=type=cache,id=next-web-cache,target=/app/apps/web/.next/cache \
    pnpm --filter @ayman/web run build

# ── runtime ───────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3200
ENV HOSTNAME=0.0.0.0

# مخرجات standalone: server.js مع الـ node_modules اللي اتلمست فعلًا بس.
# أصغر بكتير من نسخ الـ workspace كله.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public           ./apps/web/public

# ── حارس sharp ────────────────────────────────────────────────────────
#
# لما `sharp` مايقدرش يتحمّل، Next **مابيقعش**. `/_next/image` بيفضل يرد 200،
# بيتحقق من الـ `q` عادي (قيمة برّه `images.qualities` لسه بتاخد 400)، وبعدين
# بيعدّي بايتات الأصل زي ما هي بنفس الـ content-type. مفيش لوج، مفيش خطأ،
# ومفيش أي فرق ظاهر في الصفحة — الصور بتبان صح تمامًا.
#
# اتقاس على الإنتاج في 2026-08-12: نفس الصورة، نفس الطلب.
#
#            w=384      w=640     w=1200
#   محلي     16,262     38,204    100,318   بايت
#   إنتاج   206,420    206,420   206,420   بايت  ← الأصل، عند كل عرض
#
#   `/_next/image?url=/icon.png` رجّع `image/png` بنفس الـ 26,101 بايت
#   بتاعت الملف الخام — يعني ولا حتى بيحوّل الصيغة.
#
# يعني تليفون بيطلب 384px بياخد 13 ضعف اللي المفروض ياخده، على عنصر الـ LCP
# نفسه وعلى كل صورة تانية في الموقع.
#
# sharp من 0.33 بيجيب الـ binary بتاعه من optional dependency لكل منصة
# (`@img/sharp-linux-x64` هنا). لو البناء حصل على منصة تانية أو الـ optional
# dep مااتحطش، الحزمة بتتنسخ في الـ standalone من غير الـ binary وتفشل بصمت.
#
# الفحص ده بيحوّل الانهيار الصامت ده لفشل بناء صريح.
# الفحص بيتم بـ **تحميل** sharp وتصغير صورة فعلية، مش بالتأكد إن الفولدر موجود.
# النسخة الأولى من الحارس ده كانت بتدوّر على مجلد `@img/sharp-linux*` وبس —
# وعدّت على ديبلوي صوره كانت لسه مكسورة، لأن الملفات بتبقى موجودة والـ binary
# تحته مش قادر يتحمّل. الوجود مش دليل على القابلية للتحميل.
COPY --from=build /app/apps/web/scripts/verify-sharp.mjs ./verify-sharp.mjs
RUN node verify-sharp.mjs && rm verify-sharp.mjs

USER node
EXPOSE 3200

# `http.get` مش `fetch`، وبـ `maxHeaderSize` صريح.
#
# `fetch` بيرفض أي رد هيدرزه أكبر من 16KB بـ `UND_ERR_HEADERS_OVERFLOW`، فسيرفر
# سليم تمامًا بيتقري ميّت. ده اللي حصل بالظبط في 2026-08-06: هيدر `Link` وصل
# 16522 بايت على الإنتاج، الفحص وقع، الحاوية فضلت `unhealthy` وهي بتخدم عادي،
# وTraefik بطّل يوجّه ليها ورجّع 404 على كل صفحة.
#
# إصلاح الهيدر نفسه في `proxy.ts`. ده الطبقة التانية: الفحص المفروض يجاوب
# «السيرفر بيرد؟» مش «الهيدرز صغيرة؟» — التانية مالهاش علاقة بصحة الخدمة.
#
# اتقاس: على رد هيدره 20KB، `fetch` بيرمي `UND_ERR_HEADERS_OVERFLOW`،
# و`http.get` من غير الخيار بيرمي `HPE_HEADER_OVERFLOW`، وبالخيار بيرد 200.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:3200,path:'/',maxHeaderSize:262144},r=>{r.resume();process.exit(r.statusCode<500?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
