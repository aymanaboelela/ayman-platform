# الـ API — NestJS
#
# node:24-slim (Debian) مش alpine عن قصد: `sharp` بيحتاج libvips، وبناؤه على
# alpine (musl) بيحمّل أو بيبني نسخة مختلفة وبيقع بأخطاء غامضة وقت التشغيل.
# Debian بياخد الحزمة المبنية جاهزة.

FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────
# ملفات الـ manifest بس في الطبقة دي. طول ما مفيش dependency اتغيّرت،
# الطبقة دي بتتاخد من الكاش ومبنتظرش تثبيت من أول وجديد على كل commit.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json           apps/api/
COPY apps/web/package.json           apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json        packages/ui/
COPY packages/config/package.json    packages/config/
RUN pnpm install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# ⚠️ `prisma.config.ts` بيقرا DIRECT_DATABASE_URL وقت تحميل الإعدادات، حتى
# لـ `generate` اللي مش بيتصل بأي داتابيز. وجوه `docker build` مفيش متغيرات
# بيئة أصلاً — فكان بيقع بـ `PrismaConfigEnvError: Cannot resolve environment
# variable`. القيمة دي بتخلي الإعدادات تتحمّل وبس؛ محدش بيتصل بيها، والقيمة
# الحقيقية بتيجي من البيئة وقت التشغيل.
ENV DIRECT_DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=app"
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=app"

# generate قبل build. الـ Prisma client متولّد جوه `src/generated/prisma`
# ومتراكب في git، بس النسخة المتراكبة ممكن تكون قديمة بالنسبة للـ schema —
# التوليد هنا بيضمن إن اللي بيتبني هو اللي بيوصف الجداول الحالية.
RUN pnpm --filter @ayman/api exec prisma generate
RUN pnpm --filter @ayman/api run build

# ── runtime ───────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# مش root. الحاوية دي بتقرا أسرار الداتابيز وبتكتب ملفات مرفوعة.
# `node` يوزر موجود أصلاً في الصورة الرسمية.
COPY --from=build --chown=node:node /app/node_modules            ./node_modules
COPY --from=build --chown=node:node /app/packages                ./packages
COPY --from=build --chown=node:node /app/apps/api/node_modules   ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist           ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma         ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/package.json   ./apps/api/
COPY --from=build --chown=node:node /app/package.json /app/pnpm-workspace.yaml ./

# نقطة تركيب الملفات المرفوعة. لازم volume — من غيره كل نشر بيمسح
# اللي الأدمن رفعه.
RUN mkdir -p /var/lib/ayman/media && chown -R node:node /var/lib/ayman
VOLUME ["/var/lib/ayman/media"]

USER node
EXPOSE 3300

# فحص الصحة اللي الـ compose بيستنى عليه قبل ما يقلّع الويب.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3300/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

COPY --from=build --chown=node:node /app/apps/api/docker-entrypoint.sh /app/
CMD ["/app/docker-entrypoint.sh"]
