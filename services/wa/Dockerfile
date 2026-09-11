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

# `npm ci` مش `npm install`، وفيه `package-lock.json` متسجّل في الريپو.
#
# الكلام اللي كان مكتوب هنا قبل كده كان بيقول العكس: إن التثبيت غلط لأن
# «بروتوكول واتساب بيتغير من تحتها وآخر نسخة صغيرة هي اللي بتفضل شغالة».
# الحجة دي كانت غلط من ناحيتين:
#
#   · `^6.7.18` مكانش بيتابع «آخر نسخة صغيرة» — ده أي حاجة تحت 7.0.0،
#     والمدى ده بيوصل لـ6.17.16 (نشر غلط لنسخة 6.7.16 في مارس ٢٠٢٥). اللي
#     منعها من التنزيل هو إن npm بيتجنب النسخ الموقوفة، مش إن المدى ضيّق.
#   · نسخة بروتوكول واتساب نفسها مش بتتحدد من المكتبة أصلاً —
#     `fetchLatestBaileysVersion()` بيجيبها من على النت وقت كل اتصال. فتثبيت
#     المكتبة مش بيجمّد البروتوكول، ودي كانت وظيفة حاجة تانية من الأول.
#
# واللي كان بيتكلّف فعلًا: `libsignal` تبعية git من غير ref، يعني كل بناء
# بيعيد التثبيت كان بياخد أي حاجة على رأس الفرع ساعتها — كود تشفير بيتغيّر
# من غير أي diff ولا مراجعة ولا رجوع لورا. الـlockfile بيثبّت الكوميت ده.
#
# ⚠️ الـ`git config` تحت **لسه ضروري** مع `npm ci`: الـlockfile نفسه مسجّل
# عنوان الـlibsignal كـ`git+ssh://`.
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global url."https://github.com/".insteadOf "git@github.com:"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

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
