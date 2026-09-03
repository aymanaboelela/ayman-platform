# مرسل الواتساب — حاوية لوحدها عن قصد.
#
# `node:22-slim` (ديبيان) مش alpine: مكتبة Baileys وتوابعها بيطلبوا glibc في
# أكتر من موضع، وdebugging حاجة زي دي على musl مش مستاهل التوفير في الحجم.
#
# الصورة دي **مش** جزء من الـ monorepo — الـ context هنا هو `services/wa`
# لوحده، فمفيش pnpm ولا workspace ولا lockfile مشترك. اقرا README.md للسبب.
FROM node:22-slim

WORKDIR /app

# ⚠️ `git` **لازم** يكون موجود هنا، وده مش تفضيل — Baileys بيعتمد على
# `libsignal: github:WhiskeySockets/libsignal-node`، وnpm بيحتاج يعمل
# `git clone` عشان يجيب باكيدج متبعتش على npm registry أصلاً. من غيره
# `npm install` بيقع فورًا بـ `spawn git ENOENT` — ده اتأكد فعليًا (البيلد ده
# عمره ما كان ينجح قبل السطر ده)، ومش هو سبب الـ22-دقيقة hang اللي وقّف
# ديبلوي 2026-08-24: ده كان بيفشل في ثواني، مش بيعلّق.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# `npm install` مش `npm ci`: مفيش package-lock.json مقصود — الحاوية دي
# بتتبني على السيرفر ومالهاش أي علاقة بـ lockfile المشروع، وتثبيت نسخة
# Baileys بالظبط هيبقى غلط أصلاً: بروتوكول واتساب بيتغير من تحتها وآخر نسخة
# صغيرة هي اللي بتفضل شغالة.
# ⚠️ ودي كمان مش تفضيل — من غيرها البيلد ده بيقع، وبيقع بره الكود تمامًا.
#
# `libsignal` مش على الـregistry، وBaileys بيطلبه كـgit dependency. النسخ
# القديمة كانت كاتباه `git+https://…` وده بيتجاب من غير أي مفاتيح. النسخة
# اللي npm بيختارها في الحاوية دي كاتباه بالاختصار `github:WhiskeySockets/
# libsignal-node`، وnpm بيترجم الاختصار ده لـ`ssh://git@github.com/…` الأول.
# جوه حاوية بناء مفيهاش مفتاح SSH، ده بيرجع:
#
#     fatal: Could not read from remote repository.
#     Please make sure you have the correct access rights
#     exit code: 128
#
# وقّف كل ديبلوي من 2026-09-03 01:28Z — أربع نشرات ورا بعض — والموقع فضل
# شغال على البيلد القديم، فمفيش إنذار اتكسر. الرسالة بتقرا كأنها صلاحيات
# ناقصة على ريبو خاص، والريبو عام ومفتوح للكل.
#
# ده بيخلي git يجيب أي عنوان GitHub عن طريق HTTPS بدل SSH. مش بيثبّت نسخة
# ومش بيغيّر أي حاجة في الكود — بيغيّر وسيلة النقل بس.
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global url."https://github.com/".insteadOf "git@github.com:"

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
#
# الاستثناء الوحيد: لو محاولة اتصال فضلت عالقة (connecting) من غير أي تقدم
# لفترة أطول بكتير من الطبيعي — أطول من إن الـ watchdog الداخلي (في
# index.mjs) يكون صلّحها لوحده — ساعتها `/health` بترجع 503 عشان Docker
# يقدر يعمل ريستارت للحاوية بدل ما تفضل عالقة للأبد زي حادثة 2026-08-27.
# إعادة اتصال عادية أو جهاز لسه مش متربط أبدًا مش بيوصلوا للحد ده.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WA_PORT||3400)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.mjs"]
