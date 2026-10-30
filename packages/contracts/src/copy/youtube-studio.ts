/**
 * «يوتيوب» — the admin's screen for the teacher's own YouTube channel.
 *
 * Staff copy (the instructor and assistants), but held to the same voice as
 * the students' copy: no masculine address, no other teacher's name, and no
 * name of this platform's own instructor — every stack connects ITS teacher's
 * channel. `copy/youtube-voice.spec.ts` walks it.
 */

const n = (value: number) => value.toLocaleString('ar-EG');

export const youtubeStudioCopy = {
  nav: 'يوتيوب',
  title: 'قناة اليوتيوب',
  lead: 'القناة بتتربط مرة واحدة، وبعدها عناوين الفيديوهات ووصفها والتاجز والصورة المصغّرة بتتظبط من هنا — والفيديوهات اللي ناقصها حاجة بتبان لوحدها.',

  unavailable: {
    title: 'الربط مش متاح على المنصة دي لسه',
    body: 'ربط اليوتيوب محتاج إعداد من ناحية السيرفر الأول. أول ما يتظبط، الزرار هيظهر هنا على طول.',
  },

  connect: {
    title: 'القناة مش متربطة',
    body: 'بدوسة واحدة جوجل هيطلب الإذن، وبعدها كل فيديوهات القناة هتظهر هنا. مفيش باسورد بيتحفظ — بس إذن ممكن يتلغي في أي وقت.',
    button: 'ربط قناة اليوتيوب',
    working: 'بيفتح جوجل…',
    points: [
      'العنوان والوصف والتاجز من غير فتح استوديو يوتيوب',
      'لينك الكورس تحت كل فيديو، متعلّم عشان يبان مين جه من اليوتيوب',
      'اقتراح وصف وفصول من كلام الفيديو نفسه',
    ],
  },

  callback: {
    connected: 'القناة اتربطت ✓',
    denied: 'الإذن اتلغى من صفحة جوجل — ممكن المحاولة تاني في أي وقت.',
    expired: 'صفحة الربط قعدت كتير أو اتفتحت من حساب تاني. نجرّب تاني من هنا.',
    noChannel: 'الحساب ده مالوش قناة يوتيوب. لازم الدخول بحساب جوجل اللي عليه القناة.',
    noRefresh: 'جوجل ما ادّاش إذن دايم. نلغي الإذن من إعدادات حساب جوجل ونربط تاني.',
    failed: 'الربط ما كملش. نجرّب تاني بعد شوية.',
  },

  channel: {
    subscribers: (count: number) => `المشتركين ${n(count)}`,
    hiddenSubscribers: 'عدد المشتركين مخفي',
    videos: (count: number) => `${n(count)} فيديو`,
    tokenHint: (hint: string) => `الإذن محفوظ (…${hint})`,
    openOnYoutube: 'القناة على يوتيوب',
    disconnect: 'فك الربط',
    disconnecting: 'بيفك…',
    disconnectConfirm: 'فك ربط القناة؟ الإذن هيتلغي من عند جوجل، والفيديوهات نفسها مش هيحصلها حاجة.',
    disconnected: 'القناة اتفك ربطها.',
  },

  list: {
    title: 'الفيديوهات',
    search: 'دوّر في العناوين…',
    loaded: (count: number, total: number | null) =>
      total === null ? `${n(count)} فيديو` : `${n(count)} من ${n(total)} فيديو`,
    more: 'هات ٥٠ كمان',
    loadingMore: 'بيجيب…',
    refresh: 'تحديث',
    empty: 'القناة لسه مفيهاش فيديوهات.',
    noMatch: 'مفيش فيديو بالشروط دي في اللي اتحمّل.',
    edit: 'تعديل',
    views: 'مشاهدة',
    likes: 'لايك',
    all: 'الكل',
    weakNote: 'الفلاتر والبحث على الفيديوهات اللي اتحمّلت بس — «هات ٥٠ كمان» بتجيب الباقي.',
  },

  flags: {
    noDescription: 'من غير وصف',
    noSiteLink: 'من غير لينك الموقع',
    noTags: 'من غير تاجز',
    noChapters: 'من غير فصول',
  },

  newBadge: 'جديد',

  health: {
    title: 'صحة القناة',
    score: 'الدرجة',
    basis: (count: number) => `محسوبة على ${n(count)} فيديو اتحمّلوا`,
    tip: 'الدوسة على أي رقم بتعرض الفيديوهات دي بس',
    allGood: 'مفيش ولا فيديو ناقصه حاجة من دول',
    grades: {
      great: 'ممتازة',
      good: 'كويسة',
      weak: 'محتاجة شغل',
    },
  },

  newVideo: {
    eyebrow: 'نزل فيديو جديد — يلا نظبطه',
    published: (when: string) => `اتنشر ${when}`,
    more: (count: number) => `و${n(count)} فيديو جديد كمان مستنيين`,
    checklistTitle: 'قبل ما الفيديو ينتشر',
    checks: {
      title: 'عنوان فيه كلمات البحث',
      description: 'وصف',
      courseLink: 'لينك الكورس',
      chapters: 'فصول',
      tags: 'تاجز',
      thumbnail: 'صورة مصغّرة',
      category: 'التصنيف تعليم',
    },
    thumbnailUnknown: 'يوتيوب مابيقولش لو اتغيّرت — محتاجة نظرة',
    suggestAll: 'اقترح لي كل حاجة',
    edit: 'تعديل يدوي',
    dismiss: 'اتظبط من يوتيوب',
    dismissed: 'اتشال من الفيديوهات الجديدة',
    uploadsNote: 'الرفع نفسه بيفضل من استوديو يوتيوب، والمنصة بتكمّل من بعده: العنوان والوصف والفصول واللينك.',
  },

  privacy: {
    public: 'عام',
    unlisted: 'غير مُدرج',
    private: 'خاص',
  },

  editor: {
    title: 'تعديل الفيديو',
    close: 'قفل',
    loading: 'بيجيب بيانات الفيديو…',
    fieldTitle: 'العنوان',
    fieldDescription: 'الوصف',
    fieldTags: 'التاجز',
    tagsHint: 'فاصلة أو زرار الإدخال بعد كل تاج',
    tagsAdd: 'تاج جديد…',
    removeTag: (tag: string) => `شيل «${tag}»`,
    fieldCategory: 'التصنيف',
    otherCategory: (id: string) => `تصنيف تاني (${id})`,
    counter: (used: number, max: number) => `${n(used)} / ${n(max)}`,
    save: 'حفظ',
    publish: 'نشر التعديلات',
    reviewNote: 'الاقتراح اتحط في الخانات ومحتاج مراجعة — مفيش حاجة اتنشرت لسه.',
    changed: 'اتغيّر',
    saving: 'بيحفظ…',
    saved: 'اتحفظ على يوتيوب ✓',
    unsaved: 'فيه تعديلات لسه ما اتحفظتش',
    discardConfirm: 'فيه تعديلات ما اتحفظتش. نقفل من غير حفظ؟',
    quotaNote: 'كل حفظ بياخد ٥٠ وحدة من حصة اليوتيوب اليومية (١٠٬٠٠٠).',
    openOnYoutube: 'الفيديو على يوتيوب',
    overLimit: 'فيه خانة عدّت الحد بتاعها',

    thumbnail: 'الصورة المصغّرة',
    thumbnailHint: 'لحد ٢ ميجا، والأفضل مقاس ١٢٨٠×٧٢٠',
    thumbnailPick: 'رفع صورة جديدة',
    thumbnailUploading: 'بيرفع…',
    thumbnailDone: 'الصورة المصغّرة اتغيّرت ✓',
    thumbnailTooLarge: 'الصورة أكبر من ٢ ميجا',
    thumbnailBadType: 'نوع الصورة مش مقبول، المسموح JPEG وPNG بس',
    thumbnailFailed: 'الصورة ما اترفعتش',

    suggest: 'اقترح لي',
    suggesting: 'بيكتب الاقتراح…',
    suggestCourse: 'لينك أنهي كورس تحت الفيديو؟',
    suggestNoCourse: 'من غير لينك كورس',
    suggestNote: 'الاقتراح بيتحط في الخانات بس — مفيش حاجة بتتحفظ غير بعد «حفظ».',
    suggestFromCaptions: (chapters: number) =>
      chapters > 0 ? `اتكتب من ترجمة الفيديو، ومعاه ${n(chapters)} فصل` : 'اتكتب من ترجمة الفيديو',
    suggestFromTitle: 'الترجمة مش متاحة للفيديو ده، فالاقتراح اتكتب من العنوان والوصف الحالي بس، ومحتاج مراجعة كويسة.',
    suggestQuota: 'الاقتراح ممكن ياخد لحد ٢٥٠ وحدة من الحصة لو الترجمة اتقرت.',
    voiceWarning: (words: readonly string[]) => `فيه كلام بيخاطب ولد بس: ${words.join('، ')} — يتعدّل قبل الحفظ.`,
    noAi: 'الاقتراح محتاج مفتاح ذكاء اصطناعي على المنصة دي.',
  },

  errorGeneric: 'حصلت مشكلة، نجرّب تاني.',
  errorQuota: 'حصة يوتيوب اليومية انتهت، بتتجدد كل يوم حوالي الساعة ١٠ الصبح بتوقيت مصر.',
  errorAi: 'الاقتراح ما اتكتبش المرة دي — نجرّب تاني بعد شوية.',
  errorThrottled: 'طلبات كتير ورا بعض — دقيقة ونجرّب تاني.',
  errorNotConnected: 'القناة مش متربطة أو الإذن اتلغى من عند جوجل — نربطها تاني.',
  errorYoutube: (message: string) => `يوتيوب رد: ${message}`,
} as const;

/**
 * PUBLIC copy: the lines «اقترح لي» adds under a video's description, read
 * by every viewer of the channel. Plural or impersonal only, and no name —
 * the platform's name arrives through `tenantName` in the API.
 */
export const youtubeDescriptionCopy = {
  courseLine: 'الكورس كامل على المنصة:',
  chaptersHeading: 'محتوى الفيديو:',
} as const;
