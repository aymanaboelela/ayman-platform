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

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3200/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
