/**
 * «الرد الآلي» — every sentence the WhatsApp auto-reply bot sends, and the
 * admin screens behind it.
 *
 * ## A new module, not a block in `admin.ts`
 *
 * Module ids outlive a deploy (pitfalls: Turbopack), and the API reads this at
 * runtime through its own subpath export. Nothing here imports anything.
 *
 * ## The answers are DEFAULTS
 *
 * `answers.*` is what a built-in intent says until the admin rewrites it from
 * «الرد الآلي». A rewrite is a row in `wa_bot_answers`; deleting that row («رجوع
 * للأصل») brings this text back. Nothing seeds the table, so a deploy that
 * changes a default here changes it for every intent the admin never touched —
 * and for no intent he did. That is the opposite of `home_blocks`, on purpose.
 *
 * ## Placeholders, filled LIVE at send time
 *
 * Prices, links and payment numbers are never written here. `{{الأسعار}}` is
 * read from the catalog at the moment the reply is composed, so a price the
 * admin changed a minute ago is the one the bot quotes. A placeholder that
 * resolves to nothing removes its whole line, so «قناة الواتساب: » never goes
 * out half-empty. The list is `placeholders` below — the admin screen shows it.
 *
 * ## The voice
 *
 * One message for a boy, a girl or a parent, so: first person («هوصّل»),
 * inclusive plural («ابعتوا»), nominal sentences, and ـك only on a noun
 * («اشتراكك»). No name of any teacher appears here — `{{المنصة}}` is resolved
 * through the tenant gate on the server.
 */
export const copy = {
  answers: {
    price:
      'دي أسعار كورسات {{السنة}} دلوقتي 👇\n\n{{الأسعار}}\n\nالاشتراك من صفحة الكورس نفسها، والخطوات كلها مكتوبة فيها.',
    subscribe:
      'خطوات الاشتراك:\n1️⃣ عمل حساب على المنصة: {{التسجيل}}\n2️⃣ صفحة الاشتراك في الكورس:\n{{الاشتراك}}\n3️⃣ الدفع من نفس الصفحة، وصورة التحويل بتترفع هناك والاشتراك بيتفعّل بعد المراجعة.\n{{اشتراكك}}',
    payment:
      'طرق الدفع المتاحة 👇\n{{الدفع}}\n\nبعد التحويل، صورة التحويل بتترفع من صفحة الاشتراك في الكورس، والاشتراك بيتفعّل بعد المراجعة.\n{{اشتراكك}}',
    trial: '{{الحصص_المجانية}}\n\nكورسات {{السنة}} كلها هنا 👇\n{{الكورسات}}',
    whichCourse: 'كورسات {{السنة}} على المنصة 👇\n\n{{الكورسات}}',
    books: '{{الكتب}}\n\nالطلب من صفحة الكتب: {{الكتب_رابط}}',
    schedule:
      '{{المواعيد}}\nالحصص المسجّلة متاحة على المنصة في أي وقت: {{الموقع}}\nومواعيد الجديد بتتعلن أول بأول على قناة الواتساب: {{القناة}}',
    human: 'تمام 🙏 هوصّل الرسالة للفريق، والرد هيكون هنا في نفس المحادثة في أقرب وقت.',
    greeting:
      'أهلاً وسهلاً 🌷 ده الرد الآلي بتاع {{المنصة}}.\nأقدر أساعد في:\n• الأسعار\n• طريقة الاشتراك والدفع\n• الحصص المجانية\n• الكتب والشحن\n• المواعيد\nوكتابة «أكلم حد» بتوصّل الرسالة للفريق على طول.',
    thanks: '',
  },

  /** What each intent is called on the admin screen. */
  labels: {
    price: 'الأسعار',
    subscribe: 'طريقة الاشتراك',
    payment: 'طرق الدفع',
    trial: 'الحصص المجانية',
    whichCourse: 'أنهي كورس لسنتي',
    books: 'الكتب والشحن',
    schedule: 'المواعيد',
    human: 'أكلم حد من الفريق',
    greeting: 'الترحيب',
    thanks: 'شكرًا / تمام (من غير رد)',
  },

  reply: {
    /** `{{الاختيارات}}` is the numbered list, one option per line. */
    yearQuestion: 'علشان أبعت التفاصيل الصح: السنة الدراسية كام؟ ابعتوا رقم الاختيار بس 👇\n{{الاختيارات}}',
    yearRetry: 'مش واضح لي أنهي سنة 🙏 ابعتوا الرقم بس:\n{{الاختيارات}}',
    /** Sent once when nothing matched and no model answered. */
    handoff:
      'شكرًا على الرسالة 🙏 السؤال ده هوصّله للفريق، والرد هيكون هنا في نفس المحادثة في أقرب وقت.',
    greetSalam: 'وعليكم السلام ورحمة الله 🌷',
    greetHello: 'أهلاً وسهلاً 🌷',
    /** `{name}` — a student's own first name. */
    greetStudent: 'أهلاً يا {name} 🌷',
    greetParent: 'أهلاً بحضرتك 🌷',
    /** Under every answer the model wrote, so nobody mistakes it for a person. */
    modelFooter: '🤖 رد آلي — كتابة «أكلم حد» بتوصّل الرسالة للفريق.',
    /** When the asker's year is unknown and they never chose one. */
    allYears: 'المنصة',
    coursePlansFree: 'مفتوح من غير اشتراك',
    coursePlansAsk: 'التفاصيل في صفحة الكورس',
    planMonthly: 'الشهر',
    planTerm: '{term}',
    planYearly: 'السنة كاملة',
    planMonthlyClosed: 'الشهر (مفيش شهر مفتوح دلوقتي)',
    noCourses: 'مفيش كورسات منشورة للسنة دي دلوقتي — هوصّل السؤال للفريق.',
    freeLessonsYes: 'أيوه، فيه حصص مجانية تتشاف من غير اشتراك 🎁',
    /** `{title}`, `{count}`, `{url}`. */
    freeLessonsLine: '• {title}: {count} — {url}',
    freeLessonsCount: { one: 'حصة واحدة مجانية', two: 'حصتين مجانيتين', few: '{count} حصص مجانية', many: '{count} حصة مجانية' },
    freeLessonsNo: 'مفيش حصة تجريبية مفتوحة دلوقتي، بس صفحة كل كورس فيها المحتوى بالتفصيل.',
    payInstapay: '• إنستاباي: {number}',
    payWallet: '• محفظة فودافون كاش: {number}',
    payOnPage: '• الدفع من صفحة الاشتراك في الكورس، والطرق المتاحة مكتوبة هناك.',
    booksNone: 'مفيش كتب معروضة للبيع دلوقتي.',
    booksTitle: 'الكتب المتاحة دلوقتي 👇',
    /** `{title}`, `{price}`. */
    bookLine: '• {title} — {price}',
    bookLineOut: '• {title} — {price} (مش متاح دلوقتي)',
    shippingFree: 'الشحن مجاني لأي محافظة.',
    /** `{cairo}`, `{delta}`, `{far}`. */
    shippingZones: 'الشحن: القاهرة والجيزة {cairo} · وجه بحري {delta} · الصعيد والمحافظات البعيدة {far}',
    shippingZero: 'مجاني',
    /** «اشتراكك» lines — a student's own, or their parent asking. `{who}` is «اشتراكك» or «اشتراك محمد». */
    subYou: 'اشتراكك',
    /** `{name}` */
    subChild: 'اشتراك {name}',
    /** `{who}`, `{course}`, `{date}` */
    subActiveUntil: '✅ {who} في «{course}» شغّال لحد {date}.',
    subActive: '✅ {who} في «{course}» شغّال.',
    /** `{who}`, `{course}`, `{url}` */
    subExpired: '⏳ {who} في «{course}» خلص، والتجديد من هنا: {url}',
    /** `{course}`, `{date}` */
    subPending: '🕓 فيه دفعة لـ«{course}» مستنية المراجعة من {date}، وهتتراجع في أقرب وقت.',
    subRejected: '⚠️ آخر دفعة لـ«{course}» ماتقبلتش — السبب مكتوب في صفحة الكورس، وكتابة «أكلم حد» بتوصّل للفريق.',
    jeneh: 'جنيه',
    /** `{url}` — after the first few courses, so one reply never becomes a catalogue. */
    moreCourses: 'وباقي الكورسات على المنصة: {url}',
    /** `{title}`, `{note}` — a course's own `scheduleNote`. */
    scheduleLine: '🗓️ {title}: {note}',
  },

  /** The placeholders an answer may use — shown on the admin screen. */
  placeholders: [
    ['{{الأسعار}}', 'أسعار كورسات السنة دي دلوقتي، كل كورس برابطه'],
    ['{{الكورسات}}', 'كورسات السنة دي بروابطها'],
    ['{{الاشتراك}}', 'رابط صفحة الاشتراك لكل كورس من كورسات السنة'],
    ['{{السنة}}', 'اسم السنة الدراسية'],
    ['{{المواعيد}}', 'ميعاد كل كورس زي ما هو مكتوب في إعدادات الكورس'],
    ['{{الدفع}}', 'أرقام إنستاباي والمحفظة من الإعدادات'],
    ['{{الحصص_المجانية}}', 'الحصص المجانية المتاحة في كورسات السنة'],
    ['{{الكتب}}', 'الكتب بأسعارها ومصاريف الشحن'],
    ['{{الكتب_رابط}}', 'رابط صفحة الكتب'],
    ['{{التسجيل}}', 'رابط عمل حساب'],
    ['{{الموقع}}', 'رابط المنصة'],
    ['{{القناة}}', 'رابط قناة الواتساب من الإعدادات'],
    ['{{المنصة}}', 'اسم المنصة'],
    ['{{اشتراكك}}', 'حالة اشتراك الطالب، لو الرقم بتاع طالب أو ولي أمر'],
  ],

  admin: {
    tabLeads: 'المهتمين',
    tabBot: 'الرد الآلي',
    tabInbox: 'واتساب',

    botTitle: 'الرد الآلي على الواتساب',
    botLead:
      'البوت بيرد على الأسئلة المتكررة من رقم الواتساب المرتبط: الأسعار والاشتراك والدفع والحصص المجانية والكتب. الأسعار والروابط بتتقري من المنصة لحظة الرد، والسؤال اللي مالوش رد بيروح لصندوق «واتساب».',
    settingsTitle: 'التشغيل والأمان',
    enabled: 'تشغيل الرد الآلي',
    enabledHint: 'مقفول = ولا رسالة بتطلع من البوت. «قف» بتفضل شغالة.',
    quietHours: 'ساعات الهدوء',
    quietHoursHint: 'مفيش رد آلي في الوقت ده (بتوقيت القاهرة). الرسالة بتترد عليها أول ما الوقت يخلص.',
    quietFrom: 'من الساعة',
    quietTo: 'لحد الساعة',
    silence: 'سكوت البوت بعد رد حد من الفريق',
    silenceHint: 'لما حد يرد بنفسه — من هنا أو من الموبايل — البوت بيسكت في المحادثة دي المدة دي.',
    hours: 'ساعة',
    aiFallback: 'رد المساعد على الأسئلة التانية',
    aiFallbackHint: 'السؤال اللي مالوش رد جاهز بيرد عليه المساعد من معلومات المنصة بس، ولو مش متأكد بيحوّله للفريق.',
    aiUnavailable: 'مفيش مفتاح ذكاء اصطناعي متظبط على المنصة دي، فالأسئلة التانية بتروح للفريق على طول.',
    minGap: 'أقل وقت بين ردين لنفس الرقم',
    seconds: 'ثانية',
    perChatCap: 'أقصى عدد ردود لنفس الرقم في اليوم',
    dailyCap: 'أقصى عدد ردود في اليوم كله',
    capsHint: 'حدود ثابتة للأمان: مفيش أقل من ٣٠ ثانية بين ردين، ومفيش أكتر من ٢٠ رد لرقم واحد في اليوم.',
    save: 'حفظ',
    saved: 'اتحفظ',

    answersTitle: 'الردود الجاهزة',
    answersLead: 'كل رد ممكن يتعدّل، وكلمات زيادة ممكن تتضاف علشان البوت يفهم السؤال. الكلمات الأساسية ثابتة ومش بتتمسح.',
    defaultKeywords: 'الكلمات الأساسية',
    extraKeywords: 'كلمات زيادة (كلمة أو جملة في كل سطر)',
    answerText: 'نص الرد',
    answerEnabled: 'الرد ده شغال',
    resetDefault: 'رجوع للأصل',
    customized: 'متعدّل',
    builtIn: 'أساسي',
    custom: 'رد إضافي',
    addCustom: 'إضافة رد جديد',
    customLabel: 'اسم الرد',
    customKeywordsHint: 'الكلمات اللي لو جات في الرسالة البوت يرد بالنص ده.',
    deleteCustom: 'حذف',
    placeholdersTitle: 'المتغيّرات اللي ينفع تتحط في الرد',

    previewTitle: 'تجربة البوت',
    previewLead: 'رسالة زي ما الطالب هيكتبها، ونشوف البوت هيرد بإيه — من غير ما حاجة تتبعت.',
    previewText: 'الرسالة',
    previewPhone: 'رقم طالب (اختياري) — علشان تشوف الرد الشخصي',
    previewRun: 'تجربة',
    previewIntents: 'فهم إنها عن',
    previewNothing: 'ولا حاجة',
    previewAction: {
      answer: 'هيرد بالرد الجاهز',
      askYear: 'هيسأل عن السنة الأول',
      handoff: 'هيحوّلها للفريق',
      model: 'المساعد هيرد عليها',
      silent: 'مش هيرد',
    },
    previewWho: { student: 'رقم طالب', parent: 'رقم ولي أمر', lead: 'رقم جديد' },

    leadsTitle: 'المهتمين',
    leadsLead:
      'كل رقم كتب على الواتساب ومالوش حساب على المنصة. أول ما الرقم يتعمل بيه حساب ويتدفع اشتراك، بيتعلّم «تم الاشتراك» لوحده.',
    leadsEmpty: 'مفيش مهتمين لسه',
    leadsEmptyHint: 'أول ما حد مالوش حساب يكتب على الواتساب، هيظهر هنا.',
    exportCsv: 'تنزيل CSV',
    filterStatus: 'الحالة',
    filterYear: 'السنة',
    filterIntent: 'سأل عن',
    filterAll: 'الكل',
    search: 'بحث بالرقم أو الاسم',
    colPhone: 'الرقم',
    colName: 'الاسم على الواتساب',
    colYear: 'السنة',
    colAsked: 'سأل عن',
    colFirst: 'أول رسالة',
    colLast: 'آخر رسالة',
    colStatus: 'الحالة',
    colNotes: 'ملاحظات',
    notesPlaceholder: 'ملاحظة للفريق…',
    openChat: 'المحادثة',
    signedUp: 'اتعمل حساب',
    statuses: {
      new: 'جديد',
      contacted: 'اتواصلنا',
      subscribed: 'تم الاشتراك',
      not_interested: 'مفيش اهتمام',
    },
    messagesCount: '{count} رسالة',

    inboxTitle: 'محادثات الواتساب',
    inboxLead: 'الأسئلة اللي البوت حوّلها للفريق، وكل المحادثات اللي على الرقم المرتبط.',
    inboxFilter: { handoff: 'محتاجة رد', unread: 'جديدة', all: 'الكل' },
    inboxEmpty: 'مفيش محادثات هنا',
    inboxEmptyHint: 'أول ما حد يطلب يكلم حد أو يسأل سؤال مالوش رد، هيظهر هنا.',
    who: { student: 'طالب', parent: 'ولي أمر', lead: 'رقم جديد' },
    needsHuman: 'محتاجة رد',
    botPausedChip: 'البوت متوقف هنا',
    optedOutChip: 'طلب إيقاف',
    authors: { contact: '', bot: 'البوت', admin: 'الفريق', phone: 'من الموبايل' },
    replyPlaceholder: 'الرد هيتبعت من رقم الواتساب المرتبط…',
    replySend: 'إرسال',
    replySent: 'اتبعت',
    replyFailed: 'الرسالة ماطلعتش من الجهاز',
    markDone: 'تم الرد',
    markOpen: 'محتاجة رد',
    pauseBot: 'إيقاف البوت في المحادثة دي',
    resumeBot: 'تشغيل البوت هنا تاني',
    silentUntil: 'البوت ساكت هنا لحد {time} علشان حد من الفريق رد.',
    failed: 'ماطلعتش',
    openProfile: 'الملف',
    back: 'رجوع للمحادثات',
    deviceDown: 'الجهاز مش متصل — الرد مش هيطلع دلوقتي.',

    audienceLeads: 'المهتمين من الواتساب',
    audienceLeadsHint: 'أرقام كتبت على الواتساب ومالهاش حساب. دول بادئين المحادثة، فده أأمن جمهور للرقم.',
    audienceLeadStatuses: 'حالة المهتم',
    audienceLeadStatusesAll: 'الكل ما عدا «مفيش اهتمام» و«تم الاشتراك»',

    error: 'حصل خطأ، نجرّب تاني',
    pagerPrevious: 'السابق',
    pagerNext: 'التالي',
    pagerOf: 'من',
    statTotal: 'كل المهتمين',
    statsAria: 'المهتمين حسب الحالة',
    searchGo: 'بحث',
    searchClear: 'مسح',
    notesSave: 'حفظ الملاحظة',
    replyHint: 'الرد بيطلع من رقم الواتساب المرتبط، والبوت بيسكت في المحادثة دي بعده.',
    noMessages: 'مفيش رسايل',
    openLeads: 'المهتمين',
    openBot: 'إعدادات الرد الآلي',
    unreadChip: 'جديدة',
    lastMessage: 'آخر رسالة',
    customKeywordsLabel: 'الكلمات (كلمة أو جملة في كل سطر)',
    edit: 'تعديل',
    close: 'قفل',
    enabledChip: 'شغال',
    disabledChip: 'متوقف',
    keywordsCount: '{count} كلمة',
    aiOn: 'المساعد شغال كاحتياطي',
    deviceLink: 'حالة الجهاز',
  },
} as const;
