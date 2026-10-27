/**
 * «استوديو البوستات» — the admin's screen, and the captions it suggests.
 *
 * Two audiences in one file, kept apart below:
 *
 *   · `socialPostsCopy` is staff copy (the instructor and assistants).
 *   · `captionCopy` is PUBLIC copy: it is posted on Facebook and Instagram
 *     under the platform's name, read by students, parents and strangers.
 *     So it never addresses one reader in the masculine (plural or first
 *     person plural only — «تابعوا»، «يلا نذاكر سوا»), never names another
 *     teacher, platform or book, and never carries the instructor's own name:
 *     the platform name arrives as a parameter, already through
 *     `tenantName`, so a teacher's stack posts under THEIR name.
 *
 * `social/caption.spec.ts` walks every caption through the masculine-address
 * tripwire.
 */

export const socialPostsCopy = {
  nav: 'بوستات السوشيال',
  tab: 'بوستات السوشيال',
  title: 'استوديو البوستات',
  lead: 'بوستات جاهزة من اللي بيحصل فعلًا على المنصة: لوحة الشرف، نتايج الامتحانات، الشهادات، والمحتوى الجديد. الكلام بيتعدّل، البوست بيتحط على التقويم، والنشر بدوسة.',

  scanNow: 'تدوير على الجديد',
  scanning: 'بيدوّر…',
  scanFound: (n: number) => (n === 0 ? 'مفيش حاجة جديدة دلوقتي' : `اتجهز ${n.toLocaleString('ar-EG')} بوست جديد`),
  lastScan: 'آخر تدوير',
  never: 'لسه',

  settings: 'ربط الحسابات',
  connected: 'متربط',
  notConnected: 'مش متربط — النشر يدوي',
  facebook: 'فيسبوك',
  instagram: 'إنستجرام',

  statuses: {
    draft: 'مسودة',
    scheduled: 'متجدول',
    published: 'اتنشر',
    skipped: 'متخطّي',
  },
  kinds: {
    honor: 'لوحة الشرف',
    results: 'نتيجة امتحان',
    certificates: 'شهادات الأسبوع',
    course: 'كورس جديد',
    lecture: 'محاضرة جديدة',
    news: 'خبر',
  },
  formats: {
    square: 'بوست مربع',
    story: 'ستوري',
  },

  inbox: 'المسودات',
  inboxEmpty: 'مفيش مسودات دلوقتي. أول ما يحصل حاجة تستاهل بوست هتظهر هنا.',
  overdue: 'معاده عدّى ولسه ما اتنشرش',
  calendar: 'التقويم',
  week: 'أسبوع',
  month: 'شهر',
  today: 'النهارده',
  previous: 'اللي قبله',
  next: 'اللي بعده',
  weekdays: ['السبت', 'الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة'],
  dayEmpty: 'فاضي',

  edit: 'تعديل',
  close: 'إغلاق',
  caption: 'الكلام',
  captionHint: 'ده الكلام اللي هيتنشر تحت الصورة، وتعديله متاح.',
  resetCaption: 'استرجاع النص الأصلي',
  characters: (n: number, max: number) => `${n.toLocaleString('ar-EG')} / ${max.toLocaleString('ar-EG')}`,
  format: 'الشكل',
  schedule: 'ميعاد النشر',
  scheduleHint: 'بتوقيت القاهرة.',
  save: 'حفظ',
  saving: 'بيتحفظ…',
  saved: 'اتحفظ',
  scheduleAction: 'جدولة',
  unschedule: 'إلغاء الجدولة',
  skip: 'تخطّي',
  restore: 'رجوع للمسودات',
  publishNow: 'نشر دلوقتي',
  publishing: 'بيتنشر…',
  openPost: 'فتح البوست',
  markPublished: 'اتنشر يدويًا',
  rendering: 'الصورة بتترسم…',
  renderFailed: 'الصورة ما اترسمتش — فتح البوست تاني بيعيد رسمها.',
  uploadFailed: 'الصورة ما اترفعتش، والمحاولة تاني ممكنة.',
  imageMissing: 'لسه مفيش صورة — فتح البوست بيرسمها.',
  scheduledFor: 'متجدول',
  failedAttempts: (n: number) => `فشل النشر ${n.toLocaleString('ar-EG')} مرة`,

  manualTitle: 'نشر يدوي',
  manualLead:
    'الحسابات مش متربطة، فالنشر يدوي: الصورة بتنزل والكلام بيتنسخ، وبعدها اللصق في فيسبوك أو إنستجرام.',
  share: 'مشاركة',
  download: 'تنزيل الصورة',
  copyCaption: 'نسخ الكلام',
  copied: 'اتنسخ',
  openFacebook: 'فتح فيسبوك',
  openInstagram: 'فتح إنستجرام',
  manualDone: 'تم النشر',
  permalinkLabel: 'لينك البوست (اختياري)',

  confirmPublish: 'البوست هيتنشر على الصفحة دلوقتي. تأكيد؟',
  errorGeneric: 'حصل خطأ، والمحاولة تاني ممكنة',

  connection: {
    title: 'ربط فيسبوك وإنستجرام',
    lead: 'لما صفحة الفيسبوك (وحساب إنستجرام البيزنس المربوط بيها) تتربط، «نشر دلوقتي» والبوستات المتجدولة بتطلع لوحدها. من غير ربط، النشر يدوي.',
    pageId: 'رقم صفحة الفيسبوك',
    instagramUserId: 'رقم حساب إنستجرام البيزنس (اختياري)',
    token: 'توكن الصفحة',
    tokenKeep: 'متخزّن — الخانة الفاضية بتسيبه زي ما هو',
    tokenHint: (last4: string) => `متخزّن، آخره ${last4}`,
    tokenNone: 'مفيش توكن متخزّن',
    forgetToken: 'مسح التوكن',
    hashtags: 'هاشتاجات تتحط في كل بوست',
    hashtagsHint: '#مذاكرة #تفوق',
    save: 'حفظ',
    saved: 'اتحفظ',
    test: 'تجربة الربط',
    testing: 'بيجرّب…',
    testOk: (name: string) => `الربط شغال: ${name}`,
    testFailed: 'الربط مش شغال',
    useInstagram: 'استخدام الحساب ده',
    back: 'رجوع للبوستات',
    secretNote: 'التوكن بيتخزّن متشفّر على السيرفر، وعمره ما بيرجع للمتصفح.',
    stepsTitle: 'خطوات التوكن',
    /*
     * Latin identifiers ride as separate chips (`codes`), never inside the
     * sentence: a Latin run in an Arabic line flips its order.
     */
    steps: [
      {
        text: 'تطبيق جديد على موقع مطوّري ميتا، نوعه بيزنس، ومعاه منتج تسجيل الدخول للبيزنس.',
        codes: ['developers.facebook.com'],
      },
      {
        text: 'من مستكشف الـGraph: اختيار التطبيق، وطلب الصلاحيات دي:',
        codes: [
          'pages_show_list',
          'pages_read_engagement',
          'pages_manage_posts',
          'instagram_basic',
          'instagram_content_publish',
        ],
      },
      {
        text: 'توكن مستخدم طويل المدة، وبعدها من الرابط ده نسخ توكن الصفحة ورقمها:',
        codes: ['/me/accounts'],
      },
      {
        text: 'حساب إنستجرام لازم يكون بيزنس أو كرييتور ومربوط بالصفحة — «تجربة الربط» بتجيب رقمه لوحدها.',
        codes: [],
      },
    ],
  },
} as const;

/**
 * Public captions. Every function receives facts that are already safe to
 * publish (short names, no avatars) and returns the lines of ONE caption.
 * `num` formats numbers the way the image does, in Arabic-Indic digits.
 */
export const captionCopy = {
  honor: {
    head: (title: string) => `🏆 لوحة الشرف — ${title}`,
    lead: 'ألف مبروك لأبطالنا:',
    outro: 'فخورين بيكم جدًا، والجاي أحلى إن شاء الله 💪',
    tags: ['#لوحة_الشرف', '#تفوق'],
  },
  results: {
    head: (exam: string) => `📊 نتيجة ${exam}`,
    stats: (takers: string, average: string, pass: string) =>
      `${takers} طالب وطالبة امتحنوا، ومتوسط الدرجات ${average}٪، ونسبة النجاح ${pass}٪.`,
    fullMarks: (n: string) => `⭐ ${n} قفلوا الدرجة النهائية!`,
    topLead: 'الأوائل:',
    outro: 'مبروك للكل، والامتحان الجاي فرصة جديدة للجميع 💪',
    tags: ['#نتايج', '#تفوق'],
  },
  certificates: {
    head: (total: string, platform: string) => `🎓 ${total} شهادة اتكسبت الأسبوع ده على ${platform}!`,
    unit: (title: string, count: string) => `📘 ${title}: ${count}`,
    people: (names: string) => `ألف مبروك: ${names}`,
    rule: 'كل شهادة معناها ٨٥٪ أو أكتر في الوحدة أو الامتحان 👏',
    tags: ['#شهادة', '#تفوق'],
  },
  course: {
    head: (platform: string) => `🚀 كورس جديد نزل على ${platform}!`,
    title: (title: string) => `📚 ${title}`,
    cta: 'الاشتراك متاح دلوقتي:',
    tags: ['#كورس_جديد'],
  },
  lecture: {
    head: '🎬 محاضرة جديدة نزلت!',
    within: (course: string, section: string) => `ضمن ${course} — ${section}`,
    cta: 'يلا نذاكر سوا:',
    tags: ['#محاضرة_جديدة'],
  },
  news: {
    head: (title: string) => `📰 ${title}`,
    cta: 'التفاصيل كاملة:',
    tags: ['#أخبار'],
  },
  follow: (platform: string, url: string) => `تابعوا ${platform}: ${url}`,
  scoreOf: (score: string, total: string) => `${score} من ${total}`,
  /** Medals for the first three; after that, the place in digits. */
  medals: ['🥇', '🥈', '🥉'],
  /** Shown whatever the stack teaches. */
  baseTags: ['#مذاكرة'],
  /** Only on a stack that teaches programming (`TEACHES_CODE`). */
  codeTags: ['#برمجة'],

  /** On the picture itself. */
  image: {
    honor: 'لوحة الشرف',
    results: 'نتيجة الامتحان',
    takers: 'امتحنوا',
    average: 'المتوسط',
    passRate: 'نسبة النجاح',
    fullMarks: 'الدرجة النهائية',
    certificates: 'شهادات الأسبوع',
    certificatesUnit: 'شهادة',
    newCourse: 'كورس جديد',
    newLecture: 'محاضرة جديدة',
    news: 'جديد المنصة',
    congrats: 'ألف مبروك',
    onPlatform: 'على',
  },
} as const;
