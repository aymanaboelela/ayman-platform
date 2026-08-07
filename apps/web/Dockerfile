# الويب — Next.js
#
# البناء بيحصل هنا من غير API شغّال، وده مقصود: `generateStaticParams`
# و`sitemap.ts` بيستخدموا `getCatalogOrEmpty` اللي بيرجّع قايمة فاضية بدل ما
# يرمي خطأ. النتيجة إن البناء بينجح ومفيش صفحة كورس متولّدة مسبقًا — وده صح،
# الصفحات بتتولّد وقت الطلب. قبل التعديل ده كان `next build` بيقع بـ
# ECONNREFUSED جوه docker build، وهي حالة مستحيل ترضيها أصلًا.

FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json           apps/api/
COPY apps/web/package.json           apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json        packages/ui/
COPY packages/config/package.json    packages/config/
RUN pnpm install --frozen-lockfile

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
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MEDIA_ORIGIN=$NEXT_PUBLIC_MEDIA_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @ayman/web run build

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
