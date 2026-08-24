# مرسل الواتساب — حاوية لوحدها عن قصد.
#
# `node:22-slim` (ديبيان) مش alpine: مكتبة Baileys وتوابعها بيطلبوا glibc في
# أكتر من موضع، وdebugging حاجة زي دي على musl مش مستاهل التوفير في الحجم.
#
# الصورة دي **مش** جزء من الـ monorepo — الـ context هنا هو `services/wa`
# لوحده، فمفيش pnpm ولا workspace ولا lockfile مشترك. اقرا README.md للسبب.
FROM node:22-slim

WORKDIR /app

# `npm install` مش `npm ci`: مفيش package-lock.json مقصود — الحاوية دي
# بتتبني على السيرفر ومالهاش أي علاقة بـ lockfile المشروع، وتثبيت نسخة
# Baileys بالظبط هيبقى غلط أصلاً: بروتوكول واتساب بيتغير من تحتها وآخر نسخة
# صغيرة هي اللي بتفضل شغالة.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src

# بيانات الاقتران. **لازم volume** — من غيره كل نشرة بتطلب مسح QR من تاني.
ENV WA_AUTH_DIR=/var/lib/ayman/wa
ENV WA_PORT=3400
RUN mkdir -p /var/lib/ayman/wa && chown -R node:node /var/lib/ayman/wa /app

USER node
EXPOSE 3400

# مش بيتحقق من الاقتران — بيتحقق إن العملية بترد. جهاز مش مربوط لسه حاوية
# صحيحة، والفرق ده بيتقرا من `/status` في لوحة الأدمن مش من الـ orchestrator.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WA_PORT||3400)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.mjs"]
