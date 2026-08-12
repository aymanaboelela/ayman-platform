/**
 * The admin half of the Arabic string table: the course builder, the exam and
 * question-bank editors, and the «نيوز» editor.
 *
 * These three namespaces used to sit in `copy/ar.ts` next to everything else,
 * and that cost every student a download they could never use. A bundler
 * cannot tree-shake properties off a single object literal — `copy.dashboard`
 * and `copy.admin` are two keys of one value, so whatever imports the value
 * imports both. Measured on the shipped build: the table was its own 28 KB
 * gzip client chunk on 64 of 65 routes, and 36,919 of its 110,857 characters
 * — a full third — were `admin` + `quizAdmin` + `adminNews`, screens a student
 * account cannot reach at all.
 *
 * So this is a dependency direction, not a file move. This module knows about
 * the student table; the student table knows nothing about this one. Only a
 * module that names `@ayman/contracts/copy/admin` pulls these strings into a
 * chunk.
 *
 * ⚠️ The `copy` exported below is the WHOLE table — every student namespace
 * plus the three admin ones — so an admin call site still reads
 * `copy.admin.save` next to `copy.nav.courses` and `copy.common.empty`, and
 * the only thing that changed for it is the import specifier. That also means
 * this object must never be re-exported from `copy/ar.ts` or from the
 * `@ayman/contracts` root barrel. Doing so puts the admin table back on every
 * student route and nothing fails — no error, no type break, the chunk just
 * quietly grows a third again.
 *
 * Five strings are aliased out of `student.common` rather than defined here,
 * each marked at its key. They are read from student-facing components, and a
 * student component reaching into `copy.admin.*` is precisely what would drag
 * this module back onto /dashboard. `copy/ar.ts` owns them; these are aliases,
 * so the admin wording and the student wording cannot drift apart.
 */
// The self-reference, not `./ar`. apps/api reaches these strings at RUNTIME —
// `lesson.service.ts` throws with `copy.admin.lesson.*` — and Node loading this
// file would then choke on an extensionless relative specifier, exactly the way
// it already refuses to load `src/index.ts`. Every other cross-module import
// inside this package goes through the exports map for that reason.
import { copy as student } from '@ayman/contracts/copy';

const admin = {
  nav: {
    dashboard: 'لوحة التحكم',
    content: 'المحتوى',
    courses: 'الكورسات',
    questions: 'بنك الأسئلة',
    // ── Plan 6 appends below. Plan 3 owns this sub-namespace; entries are
    // ADDED here, never rewritten, or every existing admin link breaks.
    overview: 'نظرة عامة',
    students: 'الطلبة',
    attempts: 'المحاولات',
    taxonomy: 'الهيكل الدراسي',
    home: 'الصفحة الرئيسية',
    navigation: 'القوائم',
    branding: 'الهوية البصرية',
    flags: 'خصائص التشغيل',
    news: 'نيوز',
    media: 'مكتبة الوسائط',
    audit: 'سجل النشاط',
    settings: 'الإعدادات',
    /** المساعد's inbox. Sits in the teaching group — it is student contact,
     *  not site configuration. */
    inbox: 'صندوق الوارد',
    // ── Sidebar group headings. The nav is eleven links long; ungrouped,
    //    it reads as one undifferentiated list and nobody scans it.
    groupTeaching: 'التدريس',
    groupSite: 'الموقع',
    groupSystem: 'النظام',
  },
  common: {
    create: 'إضافة',
    save: 'حفظ',
    saving: 'جارٍ الحفظ',
    saved: 'اتحفظ',
    /** Aliased: the student quiz runner toasts this when an answer fails to save. */
    saveFailed: student.common.saveFailed,
    cancel: 'إلغاء',
    /** Aliased: the accessible name of every `DialogContent`/`SheetContent`
     *  close button, student side included — the mobile nav sheet, the exam
     *  gate, the submit dialog. */
    close: student.common.close,
    delete: 'حذف',
    deleteConfirm: 'متأكد؟ الإجراء ده مش هيترجع.',
    required: 'الحقل ده مطلوب',
    publish: 'نشر',
  },
  /**
   * `app/(admin)/error.tsx` — the staff-side error boundary.
   *
   * Terser than the three student- and visitor-facing ones in
   * `copy.errors.*`, and it is allowed to be, because the audience is the
   * person who can actually go and read the log. So it skips the reassurance
   * those need («المشكلة عندنا مش عندك», «مفيش حاجة ضاعت») and says the one
   * thing an editor needs to know instead: whether the write they were in the
   * middle of landed.
   *
   * It cannot answer that honestly either way — a render can throw after a
   * Server Action has already committed — so it says exactly that and tells
   * them to reload and look, rather than guessing.
   *
   * `digestLabel` is NOT redefined here. It is `copy.errors.digestLabel` and
   * it resolves from this module too, because the export below spreads the
   * whole student table in; one product, one name for that number.
   */
  error: {
    title: 'الصفحة وقعت',
    body: 'حصل خطأ على السيرفر والصفحة مااتعرضتش. لو كنت في نص حفظ، مش مضمون إنه عدّى — حمّل الصفحة تاني واتأكد من آخر تغيير قبل ما تكمّل.',
    /** Sits beside the digest. The number is only useful to someone who knows
     *  it also appears in the server log, and nothing else on this screen
     *  says so. */
    digestHint: 'الكود ده موجود جنب تفاصيل الخطأ في لوج السيرفر',
  },
  course: {
    listTitle: 'الكورسات',
    new: 'كورس جديد',
    title: 'اسم الكورس',
    edit: 'تعديل الكورس',
    slug: 'المُعرّف في الرابط',
    slugHint: 'حروف إنجليزي صغيرة وأرقام وشرطات — ده اللي بيظهر في العنوان',
    /** The 409 from `updateCourseAction`, which is always the slug. */
    slugTaken: 'الرابط ده مستخدم في كورس تاني. غيّره وجرّب تاني.',
    /**
     * The option that HOLDS a course's existing subject when the picker's
     * list does not contain it. Unnamed on purpose — the taxonomy no longer
     * offers this subject here, so there is no `nameAr` to show, and
     * inventing one would be worse than saying plainly that this is what the
     * course has now.
     */
    subjectCurrent: 'المادة الحالية (سيبها زي ما هي)',
    subtitle: 'وصف مختصر',
    description: 'الوصف',
    system: 'النظام الدراسي',
    year: 'الصف الدراسي',
    track: 'المسار',
    trackNoneYear1: 'الصف الأول مالوش مسار',
    subject: 'المادة',
    subjectEmpty: 'مفيش مواد متاحة للاختيار ده — جرّب نظام أو صف أو مسار تاني',
    status: 'الحالة',
    statusDraft: 'مسودة',
    statusPublished: 'منشور',
    statusArchived: 'مؤرشف',
    publish: 'نشر',
    unpublish: 'رجّعه مسودة',
    publishBlocked: 'لازم يكون فيه محاضرة منشورة واحدة على الأقل',
    // I4 (audit): a course with student quiz attempts can never be
    // hard-deleted — attempt_events is append-only at the database level,
    // by design, forever. Archiving (not unpublishing back to draft) is
    // the correct action: it is a distinct, permanent retirement state,
    // not "still being worked on".
    deleteBlockedAttempts: 'الكورس ده فيه محاولات امتحانات لطلبة، فمينفعش يتمسح خالص — أرشفه بدل ما تمسحه',
    archiveConfirm: 'متأكد إنك عايز تؤرشف الكورس ده؟ هيتشال من واجهة الطلبة.',
    restoreConfirm: 'متأكد إنك عايز ترجّع الكورس ده مسودة؟',
    deleteConfirm: 'متأكد إنك عايز تمسح الكورس ده؟ الإجراء ده مش هيترجع.',
    empty: 'مفيش كورسات لسه',
    cover: 'صورة الكورس',
    coverHint: 'بتظهر في صفحة الكورسات وفي لوحة الطالب. أحسن مقاس ١٦:٩.',
    /**
     * The course's access policy, in the instructor's words.
     *
     * Not «مدفوع»: there is no payment system, so calling it paid would
     * promise a checkout that does not exist. What the switch actually does
     * is close the course to everyone who has not been given it.
     */
    requiresGrant: 'اقفل الكورس ده',
    requiresGrantHint:
      'الكورس هيبقى مقفول على أي حد جديد لحد ما تفتحه له بنفسك. الطلبة المشتركين قبل كده هيكمّلوا عادي، والمحاضرات اللي عليها «معاينة مجانية» هتفضل مفتوحة للكل.',
  },
  section: {
    new: 'قسم جديد',
    title: 'اسم القسم',
    summary: 'نبذة',
    empty: 'مفيش أقسام لسه',
    edit: 'تعديل',
    delete: 'حذف القسم',
    deleteConfirm: 'هيتمسح القسم وكل المحاضرات اللي جواه. الإجراء ده مش هيترجع.',
    // The refusal is PERMANENT — attempt history can never be deleted — so
    // this must not read like "try again later". It names the real reason
    // and points at the action that actually achieves what the admin wanted.
    deleteBlockedAttempts:
      'القسم ده فيه محاضرة عليها محاولات امتحان لطلبة، فمينفعش يتمسح خالص — رجّعه مسودة عشان يختفي من الطلبة ودرجاتهم تفضل محفوظة',
    lessonCount: 'محاضرة',
  },
  lesson: {
    new: 'محاضرة جديدة',
    title: 'عنوان المحاضرة',
    kind: 'النوع',
    freePreview: 'معاينة مجانية',
    estimatedSeconds: 'المدة التقديرية بالثواني',
    videoUrl: 'رابط يوتيوب',
    videoUrlHint: 'بناخد كود الفيديو (11 حرف) بس — الباقي بيتشال ومحدش بيفتح الرابط',
    videoUrlInvalid: 'الرابط ده مش رابط يوتيوب صالح',
    /** Only ever a LABEL now — the field it used to name is gone. */
    duration: 'مدة الفيديو',
    /**
     * The manual field, which appears ONLY after both probes came back empty.
     * It is the escape hatch, not the interface: «المدة دي الكود اللي
     * يعرفها، مش أنا».
     */
    durationSeconds: 'مدة الفيديو بالثواني',
    /** Under the link while YouTube is being asked. */
    durationProbing: 'بنجيب المدة من يوتيوب…',
    /** At rest — so nobody goes hunting for a number that arrives on its
     *  own. Short on purpose: it sits in a 10rem column beside the link. */
    durationAuto: 'بتتجاب من يوتيوب',
    /**
     * Both probes came back empty: the server asked YouTube's watch page and
     * the browser asked the player, and neither answered. Private, deleted,
     * region-blocked or un-embeddable videos do this. The manual field below
     * is what unblocks the save.
     */
    durationFailed: 'يوتيوب مارضيش يقول مدة الفيديو ده — اكتبها بالثواني.',
    durationRetry: 'جرّب تاني',
    /** The API's own refusal, when a save arrives with no duration and the
     *  server's probe could not find one either. */
    durationUnavailable:
      'مش قادرين نجيب مدة الفيديو من يوتيوب — اتأكد إن الفيديو متاح للعامة، أو اكتب المدة بالثواني بنفسك',
    body: 'محتوى الدرس',
    empty: 'مفيش محاضرات في القسم ده',
    edit: 'تعديل',
    delete: 'حذف',
    deleteConfirm: 'هتتمسح المحاضرة وكل اللي جواها — الفيديو والمواد. الإجراء ده مش هيترجع.',
    deleteBlockedAttempts:
      'المحاضرة دي عليها محاولات امتحان لطلبة، فمينفعش تتمسح خالص — رجّعها مسودة عشان تختفي من الطلبة ودرجاتهم تفضل محفوظة',
    /** Rendered as `{deleteWithProgress} ٧` — only when the count is not zero. */
    deleteWithProgress: 'تقدّم الطلبة دول في المحاضرة هيتمسح معاها:',
    removeVideo: 'شيل الفيديو',
    removeVideoConfirm: 'هيتشال الفيديو من المحاضرة. المحاضرة نفسها هتفضل موجودة.',
    settings: 'إعدادات المحاضرة',
    completionMode: 'قاعدة الإتمام',
    completionNone: 'من غير قاعدة',
    completionManual: 'الطالب بيعلّمها خلصت',
    completionOnView: 'بعد مشاهدة مدة معيّنة',
    completionOnGrade: 'بعد ما ياخد درجة',
    completionOnPass: 'بعد ما ينجح',
    minViewSeconds: 'أقل مدة مشاهدة بالثواني',
    passGrade: 'درجة النجاح ٪',
    poster: 'صورة المحاضرة',
    posterHint: 'بتظهر قبل ما الفيديو يشتغل. لو سيبتها فاضية هتظهر صورة يوتيوب.',
    // The quiz link is no longer gated on `kind === 'quiz'`, so it has to say
    // which of the two situations it is: open the quiz, or start one.
    addQuiz: 'ضيف اختبار للمحاضرة',
  },
  exam: {
    title: 'امتحان الكورس',
    hint: 'اختار محاضرة من نوع «اختبار» تبقى امتحان الكورس النهائي. مش هتتفتح للطالب غير لما يخلّص كل المحاضرات التانية، ولازم ينجح فيها عشان الكورس يتحسب خلص.',
    none: 'من غير امتحان',
    save: 'احفظ',
    noQuizLessons: 'لازم تعمل محاضرة من نوع «اختبار» الأول.',
    current: 'الامتحان الحالي',
    scaffold: 'أضف امتحان الكورس',
    open: 'افتح الامتحان',
    scaffoldFailed: 'مقدرناش نعمل الامتحان — جرّب تاني',
    advanced: 'اختيارات متقدمة',
    /** Rendered as `١٢ سؤال`. */
    questionCount: 'سؤال',
    noQuestions: 'لسه من غير أسئلة',
    /**
     * The gate line, rendered as `{gateLocked} ٢٤ {gateLessonUnit}`.
     * The number is computed from the course's own published lessons, so it
     * moves as the instructor publishes — which is what teaches the rule
     * better than a paragraph would.
     */
    gateLocked: 'هيتفتح للطالب بعد ما يخلّص',
    gateLessonUnit: 'محاضرة',
    gateNoLessons: 'مفيش محاضرات منشورة لسه، فالامتحان هيتفتح للطالب على طول',
    draft: 'لسه مسودة',
  },
  resource: {
    title: 'مواد الدرس',
    hint: 'المواد بتتعلّق على أي نوع محاضرة — فيديو، نص، أو مرفقات.',
    add: 'أضف مادة',
    kind: 'النوع',
    kindPresentation: 'بريزنتيشن أساسي',
    kindVideo: 'فيديو شرح',
    kindDocument: 'ملف',
    kindLink: 'رابط',
    resourceTitle: 'الاسم',
    description: 'وصف مختصر',
    file: 'الملف',
    /**
     * ⚠️ The number here MUST equal `MAX_DOCUMENT_BYTES`, which is 95 MiB.
     *
     * It said «٢٠٠ ميجا» and nothing enforced 200 anywhere — a promise the
     * product could not keep, on the one screen where being wrong costs the
     * instructor a long upload before the refusal. See the constant's own
     * note for why 95 is Cloudflare's number rather than ours.
     */
    fileHint: 'PDF أو PowerPoint أو Word أو Excel — ٩٥ ميجا كحد أقصى',
    fileDropHint: 'اسحب الملف هنا أو دوس عشان تختار',
    videoUrl: 'رابط يوتيوب',
    linkUrl: 'الرابط',
    linkUrlHint: 'لازم يبدأ بـ https',
    uploading: 'بنرفع…',
    /**
     * Why an upload was refused, in words an instructor can act on.
     *
     * There used to be one line for all of them — «مقدرناش نرفع الملف» — and
     * it was shown in a toast that faded, so a deck that was simply too big
     * looked identical to a broken server. `uploadFailed` stays as the
     * fallback for a refusal we did not anticipate.
     */
    uploadFailed: 'مقدرناش نرفع الملف',
    uploadTooLarge: 'الملف كبير أوي — الحد الأقصى ٩٥ ميجا.',
    uploadBadType: 'النوع ده مش مدعوم. المسموح: PDF أو PowerPoint أو Word أو Excel.',
    uploadUnreadable: 'الملف ده مش سليم أو نوعه الحقيقي مش زي امتداده.',
    uploadNetwork: 'النت قطع في نص الرفع. جرّب تاني.',
    uploaded: 'الملف اترفع',
    /** Why «أضف مادة» is greyed out — shown right next to it, never alone. */
    needsFile: 'اختار الملف الأول',
    remove: 'حذف',
    empty: 'لسه مفيش مواد. ابدأ بالبريزنتيشن الأساسي.',
    onePresentationOnly: 'فيه بريزنتيشن أساسي واحد بس لكل محاضرة.',
    edit: 'تعديل',
    save: 'احفظ',
    cancel: 'إلغاء',
  },
  reorder: {
    hint: 'اسحب لإعادة الترتيب، أو استخدم زر المسافة والأسهم من الكيبورد',
    handle: 'مقبض السحب',
    /**
     * ⚠️ Says «المحاضرة» and is read by FOUR sortable lists, three of which
     * are not lectures at all: `admin/home/block-composer.tsx`,
     * `admin/navigation/nav-editor.tsx` and `admin/quiz/slot-list.tsx`
     * announce a home block, a nav item and a quiz question as "the lecture"
     * to a screen reader.
     *
     * That is a real defect and it PREDATES this work. Fixing it means
     * editing three files this change set does not otherwise touch, so it is
     * recorded here instead of fixed in passing. Do NOT rename this key —
     * four call sites read it.
     */
    pickedUp: 'اتمسكت المحاضرة في الترتيب رقم',
    pickedUpSection: 'اتمسك القسم في الترتيب رقم',
    pickedUpResource: 'اتمسكت المادة في الترتيب رقم',
    movedOver: 'بقت في الترتيب رقم',
    dropped: 'اتسابت في الترتيب رقم',
    cancelled: 'اتلغى السحب والترتيب رجع زي ما كان',
  },
  // ── Plan 6 owns everything from here down inside `admin` ───────────────
  title: 'لوحة التحكم',
  signedInAs: 'داخل باسم',
  openMenu: 'فتح القائمة',
  overviewLead: 'كل حاجة بتظهر للطالب بتتظبط من هنا.',
  /** The redesigned overview: a stat strip, then the section grid. */
  overview: {
    greeting: 'أهلًا بيك',
    statStudents: 'طالب مسجّل',
    statPublished: 'كورس منشور',
    statDrafts: 'كورس مسودة',
    statsUnavailable: 'الأرقام مش متاحة دلوقتي — جرّب حدّث الصفحة',
    sectionsTitle: 'أقسام اللوحة',
    sectionsLead: 'كل قسم بيتحكّم في حتة من اللي الطالب بيشوفه.',
    quickTitle: 'إجراءات سريعة',
    quickNewCourse: 'كورس جديد',
    quickHomeBlocks: 'أقسام الصفحة الرئيسية',
    quickMedia: 'ارفع صورة',
  },
  // ── Task 16 appends more keys under commandPalette (search, groups, empty).
  commandPalette: {
    trigger: 'البحث السريع',
  },
  shortcuts: {
    paletteLabel: 'لوحة الأوامر',
    placeholder: 'دور على أمر أو صفحة...',
    navigate: 'التنقل',
    act: 'إجراءات',
    newNavItem: 'عنصر قائمة جديد',
    upload: 'ارفع صورة',
  },
  actions: {
    save: 'حفظ',
    saving: 'جارٍ الحفظ',
    saved: 'تم الحفظ',
    cancel: 'إلغاء',
    /** Aliased: `toastUndoable` in apps/web is generic, not admin-only. */
    undo: student.common.undo,
    delete: 'حذف',
    archive: 'أرشفة',
    restore: 'استرجاع',
    publish: 'نشر',
    unpublish: 'إلغاء النشر',
    create: 'إضافة',
    edit: 'تعديل',
    confirm: 'تأكيد',
    /** Aliased: the other half of `toastUndoable`'s pair. */
    undone: student.common.undone,
  },
  settings: {
    title: 'إعدادات المنصة',
    sectionBranding: 'الهوية البصرية',
    sectionSeo: 'بيانات محركات البحث',
    sectionContact: 'وسائل التواصل',
    accent: 'اللون الأساسي',
    radius: 'حدة الحواف',
    logoLight: 'الشعار — الوضع الفاتح',
    logoDark: 'الشعار — الوضع الداكن',
    favicon: 'أيقونة الموقع',
    seoTitle: 'عنوان الموقع',
    seoDescription: 'وصف الموقع',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    whatsapp: 'واتساب',
    facebook: 'فيسبوك',
    youtube: 'يوتيوب',
    telegram: 'تليجرام',
    // ── Task 8 (settings editor form) appends below.
    logoLightHint: 'بيظهر في الوضع الفاتح',
    logoDarkHint: 'بيظهر في الوضع الداكن',
    ogImage: 'صورة المشاركة',
    assetNone: 'بدون',
    seoTitleHint: 'حتى 70 حرف — بيظهر في تبويب المتصفح ونتائج البحث',
    seoDescriptionHint: 'حتى 160 حرف — الوصف اللي بيظهر تحت العنوان في نتائج البحث',
    phoneHint: 'بصيغة دولية، يعني +20 وبعدها الرقم',
    urlHttpsOnly: 'لازم يبدأ بـ https://',
    accentPreviewLabel: 'معاينة اللون',
  },
  branding: {
    title: 'الهوية البصرية',
    lead: 'الألوان بتتختار من مجموعة جاهزة — مفيش كتابة ألوان بإيدك.',
    accentAmber: 'كهرماني',
    accentCyan: 'سماوي',
    accentBlue: 'أزرق',
    accentViolet: 'بنفسجي',
    accentMagenta: 'أرجواني',
    accentSlate: 'رمادي',
    radiusSharp: 'حواف حادة',
    radiusDefault: 'الافتراضي',
    radiusSoft: 'حواف ناعمة',
    preview: 'معاينة',
  },
  list: {
    searchPlaceholder: 'دور...',
    clearFilters: 'امسح الفلاتر',
    selectedCount: '{n} متحدد',
    page: 'صفحة',
    of: 'من',
    perPage: 'عدد الصفوف',
    first: 'الأولى',
    previous: 'السابقة',
    next: 'التالية',
    last: 'الأخيرة',
    noResults: 'مفيش نتائج مطابقة',
    selectAll: 'حدد الكل',
    selectRow: 'حدد الصف',
  },
  students: {
    columnName: 'الاسم',
    columnEmail: 'البريد الإلكتروني',
    columnPhone: 'رقم الهاتف',
    columnGovernorate: 'المحافظة',
    columnYear: 'الصف',
    columnTrack: 'المسار',
    columnOnboarding: 'حالة التسجيل',
    columnCreatedAt: 'تاريخ الانضمام',
    onboardingDone: 'اكتمل التسجيل',
    onboardingPending: 'لسه ما كملش',
    filterGovernorate: 'المحافظة',
    filterYear: 'الصف',
    filterTrack: 'المسار',
    detailTitle: 'بيانات الطالب',
  /**
   * The panel that opens a closed course for one student — the key to
   * `Course.requiresGrant`. Worded around OPENING rather than around paying,
   * because nothing here charges anybody.
   */
  courseAccess: 'الكورسات المقفولة',
  courseAccessLead: 'الكورسات اللي قافلها بتتفتح للطالب من هنا.',
  courseAccessEmpty: 'الطالب ده مافتحتلوش أي كورس مقفول.',
  grantCourse: 'افتح كورس',
  grantOpen: 'افتح',
  grantLive: 'مفتوح',
  grantRevoked: 'اتقفل',
  revokeGrant: 'اقفله',
  noClosedCourses: 'مفيش كورسات مقفولة أصلاً.',
  allClosedGranted: 'كل الكورسات المقفولة مفتوحة للطالب ده.',
    backToList: 'رجوع لقائمة الطلبة',
    profileSection: 'البيانات الشخصية',
    academicSection: 'البيانات الدراسية',
    fullName: 'الاسم بالكامل',
    schoolName: 'اسم المدرسة',
    fatherPhone: 'رقم هاتف ولي الأمر',
    motherPhone: 'رقم هاتف الأم',
    schoolStream: 'المدرسة',
    /** The profiles that predate the question — not a guess, and not blank. */
    schoolStreamUnknown: 'مش متسجّل',
    electiveSubject: 'المادة الاختيارية',
    memberSince: 'عضو من',
    currentRole: 'الدور الحالي',
    roleAdmin: 'مسؤول',
    roleStudent: 'طالب',
    changeRole: 'تغيير الدور',
    roleChangeTitle: 'تغيير دور المستخدم',
    roleChangeNewRole: 'الدور الجديد',
    roleChangeReason: 'سبب التغيير',
    roleChangeReasonPlaceholder: 'وضّح سبب تغيير الدور — هيتسجل في سجل النشاط',
    roleChangeConfirm: 'تأكيد التغيير',
    roleChangeSuccess: 'اتغيّر الدور',
    roleChangeFailed: 'مقدرناش نغيّر الدور — حاول تاني',
    roleChangeSelfError: 'مينفعش تغيّر دورك إنت',
    roleChangeLastAdminError: 'ده آخر مسؤول في المنصة — مينفعش تلغي صلاحياته',
    saveSuccess: 'اتحفظت بيانات الطالب',
    saveFailed: 'مقدرناش نحفظ — حاول تاني',
  },
  taxonomy: {
    title: 'الهيكل الدراسي',
    lead: 'الأنظمة الدراسية والمحافظات والمسارات والمواد — بما فيها الأسماء بالعربي.',
    governoratesTitle: 'المحافظات',
    systemsTitle: 'الأنظمة الدراسية',
    tracksTitle: 'المسارات',
    subjectsTitle: 'المواد',
    columnName: 'الاسم',
    columnSlug: 'المُعرّف',
    columnRegion: 'المنطقة',
    columnActive: 'مفعّلة',
    active: 'مفعّلة',
    inactive: 'غير مفعّلة',
    columnSortOrder: 'الترتيب',
    columnTotalMarks: 'الدرجة الكلية',
    columnPassPercent: 'نسبة النجاح %',
    columnAllowsRetakes: 'بيسمح بإعادة السنة',
    columnSystem: 'النظام',
    columnMinYear: 'أقل صف',
    columnAliases: 'أسماء بديلة',
    regionUrban: 'حضر',
    regionLower: 'وجه بحري',
    regionUpper: 'وجه قبلي',
    regionFrontier: 'حدودي',
    edit: 'تعديل',
    newTrack: 'مسار جديد',
    newSubject: 'مادة جديدة',
    slugHint: 'حروف إنجليزي صغيرة وأرقام وشرطات — ثابت بعد الإنشاء',
    slugImmutable: 'المُعرّف ثابت ومينفعش يتغيّر بعد الإنشاء',
    deleteConfirm: 'متأكد إنك عايز تحذف المادة دي؟',
    subjectInUse: 'المادة مرتبطة بمقرر دراسي — احذف المقرر الأول',
    saveSuccess: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ — حاول تاني',
    academicYearsTitle: 'الصفوف الدراسية',
  },
  media: {
    title: 'مكتبة الوسائط',
    lead: 'الصور بتتحول لـ WebP تلقائيًا وبتتحفظ باسم عشوائي — الاسم الأصلي والبيانات المخفية بتتشال.',
    upload: 'ارفع صورة',
    uploading: 'جارٍ الرفع…',
    uploadSuccess: 'اترفعت الصورة',
    uploadFailed: 'مقدرناش نرفع الصورة — تأكد إنها PNG أو JPEG أو WebP أو AVIF أو GIF وأصغر من 8 ميجا',
    /**
     * Why an upload was refused, in words an instructor can act on.
     *
     * `uploadFailed` above is the fallback and was, for a while, the ONLY
     * thing shown — the action threw away the API's reason, so a 12 MB photo
     * and a `.heic` straight off an iPhone both looked like "it just doesn't
     * work". These are the three refusals `media.service.ts` actually issues,
     * mapped in `MediaKeyField.uploadReason`.
     */
    uploadTooLarge: 'الصورة كبيرة أوي — الحد الأقصى ٨ ميجا. صغّرها وحاول تاني.',
    uploadBadType:
      'نوع الملف ده مش مدعوم. استخدم PNG أو JPG أو WEBP. صور الآيفون (HEIC) لازم تتحوّل الأول.',
    uploadUnreadable: 'مقدرناش نقرا الملف ده كصورة. اتأكد إنه صورة سليمة.',
    /**
     * A dropped connection, NOT a refusal — so the wording sends the
     * instructor back to the same file rather than to a different one. The
     * upload now goes browser→API directly, which makes this a state a phone
     * on a weak signal will genuinely reach.
     */
    uploadNetwork: 'النت قطع في نص الرفع. جرّب تاني بنفس الصورة.',
    /** The formats and the ceiling, shown BEFORE anything is picked. */
    uploadHint: 'PNG أو JPG أو WEBP أو GIF — ٨ ميجا كحد أقصى',
    /** Opens the full-size image in its own tab — see `MediaKeyField`. */
    viewImage: 'اعرضها بحجمها',
    /**
     * `<CoverCropper>` — «أقدر أضبط المسافات بتاعتها، أقصها».
     *
     * The crop is OPTIONAL by design, which is why `cropUseOriginal` is a
     * peer of `cropConfirm` rather than a link hidden under it: a picture
     * that is already 16:9 needs nothing done to it, and making everyone
     * pass through a crop step to upload one would be a tax, not a feature.
     */
    cropTitle: 'اقصّ الصورة',
    cropHint: 'اسحب الصورة عشان تحرّكها، والشريط اللي تحت بيكبّرها. اللي جوّه الإطار هو اللي هيتحفظ.',
    cropZoom: 'تكبير',
    cropConfirm: 'تمام، استخدمها',
    cropUseOriginal: 'من غير قص',
    cropCancel: 'إلغاء',
    cropFailed: 'مقدرناش نفتح الصورة عشان نقصّها. تقدر ترفعها زي ما هي.',
    dropHint: 'اسحب صورة هنا أو دوس عشان تختار ملف',
    altLabel: 'وصف الصورة',
    altPlaceholder: 'وصف مختصر للصورة',
    archive: 'أرشفة',
    restore: 'استرجاع',
    archived: 'مؤرشفة',
    showArchived: 'اعرض المؤرشف',
    empty: 'مفيش صور لسه',
    dimensions: '{width}×{height}',
    sizeKb: '{kb} ك.ب',
    // `<MediaKeyField>` — picking a cover or a thumbnail from inside another
    // form, rather than from the library page.
    noImage: 'مفيش صورة',
    chooseImage: 'اختار صورة',
    replaceImage: 'غيّر الصورة',
    removeImage: 'شيل الصورة',
  },
  flags: {
    title: 'خصائص التشغيل',
    lead: 'تشغيل أو إيقاف خصائص المنصة من غير أي نشر جديد للكود.',
    toggleSuccess: 'اتحفظت الخاصية',
    toggleFailed: 'مقدرناش نغيّر الخاصية — حاول تاني',
  },
  navigation: {
    title: 'القوائم',
    lead: 'عناصر القائمة — اسحب لإعادة الترتيب على مستويين.',
    newItem: 'عنصر جديد',
    newChild: 'عنصر فرعي',
    editItem: 'تعديل العنصر',
    label: 'النص الظاهر',
    href: 'الرابط',
    hrefHint: 'رابط داخلي بيبدأ بـ / زي /courses',
    icon: 'الأيقونة (اختياري)',
    parent: 'العنصر الأب',
    noParent: 'بدون — مستوى أول',
    visibleTo: 'يظهر لمين',
    visibleToHint: 'من غير أي صلاحية محددة، العنصر يظهر للجميع',
    published: 'منشور',
    archiveConfirm: 'متأكد إنك عايز تؤرشف العنصر ده؟',
    archived: 'اتأرشف العنصر',
    archiveUndo: 'تراجع',
    restored: 'اترجع العنصر',
    saveFailed: 'مقدرناش نحفظ — حاول تاني',
    saveSuccess: 'اتحفظ',
    emptyChildren: 'مفيش عناصر فرعية',
  },
  home: {
    title: 'الصفحة الرئيسية',
    lead: 'ترتيب أقسام الصفحة الرئيسية — اسحب لإعادة الترتيب.',
    addBlock: 'أضف قسم',
    preview: 'معاينة',
    emptyTitle: 'الصفحة الرئيسية لسه شغّالة بالترتيب الافتراضي',
    emptyBody:
      'الزوار بيشوفوا الصفحة كاملة عادي. دوس هنا عشان تحوّل أقسامها لصفوف تقدر ترتّبها وتعدّل نصوصها وتخفي اللي مش عايزه.',
    emptyCta: 'ابدأ من الصفحة الحالية',
    seeding: 'جارٍ التجهيز…',
    seeded: 'الأقسام اتجهّزت',
    published: 'منشور',
    unpublished: 'مسودة',
    publish: 'انشر',
    unpublish: 'إلغاء النشر',
    archiveConfirm: 'متأكد إنك عايز تؤرشف القسم ده؟',
    archived: 'اتأرشف القسم',
    restored: 'اترجع القسم',
    saveSuccess: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ — حاول تاني',
    blockTypeHero: 'قسم البداية',
    blockTypeWhyRail: 'ليه تتعلم هنا',
    blockTypeCourseGrid: 'شبكة كورسات',
    blockTypeInstructor: 'كارت المحاضر',
    blockTypeYearTracks: 'مسارات الصفوف',
    blockTypeAbout: 'نبذة عن المحاضر',
    blockTypeStats: 'إحصائيات',
    blockTypeTestimonials: 'آراء الطلبة',
    blockTypeFaq: 'أسئلة شائعة',
    blockTypeCta: 'دعوة لإجراء',
    /** Shown instead of a form for the two placement-only block types. */
    placementOnly:
      'القسم ده بيبني نفسه من الكورسات والهيكل الدراسي، فمفيش نصوص تتعدّل فيه. اللي بيتحكم فيه هنا هو مكانه في الصفحة، ونشره من عدمه.',
    keyLabel: 'مُعرّف القسم',
    keyHint: 'حروف إنجليزي صغيرة وأرقام وشرطات — ثابت بعد الإنشاء',
    headline: 'العنوان الرئيسي',
    subheadline: 'العنوان الفرعي',
    ctaLabel: 'نص الزرار',
    ctaHref: 'رابط الزرار',
    blockTitle: 'عنوان القسم',
    statLabel: 'التسمية',
    statValue: 'القيمة',
    addStat: 'أضف إحصائية',
    testimonialName: 'الاسم',
    testimonialBody: 'الرأي',
    addTestimonial: 'أضف رأي',
    faqQuestion: 'السؤال',
    faqAnswer: 'الإجابة',
    addFaq: 'أضف سؤال',
    removeItem: 'احذف',
    courseLimit: 'أقصى عدد كورسات معروضة',
    // ── fields the new section blocks add ────────────────────────────────
    // `blockLead`, not `lead` — `admin.home.lead` above is the SCREEN's own
    // description ("drag to reorder"), and this is a field label inside a
    // block's edit form. Two different strings, so two different keys.
    eyebrow: 'السطر الصغير فوق العنوان',
    blockLead: 'الفقرة التعريفية',
    leadSecondary: 'فقرة تانية (اختيارية)',
    titleAccent: 'الجزء الملوّن من العنوان',
    rotating: 'الأسطر المتبدّلة',
    addRotating: 'أضف سطر',
    rotatingHint: 'السطر التاني في العنوان بيلف على دول. سيبها فاضية لو عايزه ثابت.',
    secondaryCtaLabel: 'نص الزرار التاني',
    secondaryCtaHref: 'رابط الزرار التاني',
    heroStats: 'الأرقام تحت الأزرار',
    addHeroStat: 'أضف رقم',
    featureTitle: 'عنوان الميزة',
    featureBody: 'شرح الميزة',
    addFeature: 'أضف ميزة',
    aboutBody1: 'الفقرة الأولى',
    aboutBody2: 'الفقرة التانية',
    aboutRole: 'الصفة تحت الاسم',
    aboutChips: 'الوسوم',
    addChip: 'أضف وسم',
  },
  audit: {
    title: 'سجل النشاط',
    lead: 'كل تغيير في لوحة التحكم بيتسجل هنا، ومتسلسل بحيث أي تعديل عليه بعد كده بيتكشف.',
    chainOk: 'سلسلة السجل سليمة',
    chainOkCount: '{n} صف',
    chainBroken: 'سلسلة السجل اتكسرت',
    chainBrokenAt: 'أول صف مكسور: {id}',
    verifyButton: 'تحقق من السلسلة',
    verifying: 'جارٍ التحقق…',
    verifyHint: 'السجل كبير — دوس على الزرار عشان تتحقق من السلسلة',
    columnTime: 'الوقت',
    columnActor: 'المستخدم',
    columnAction: 'الإجراء',
    columnResource: 'العنصر',
    columnOutcome: 'النتيجة',
    columnMetadata: 'تفاصيل',
    columnHash: 'البصمة',
    outcomeSuccess: 'نجح',
    outcomeFailure: 'فشل',
    outcomeDenied: 'اتمنع',
    noActor: 'النظام',
    filterAction: 'الإجراء',
    filterResourceType: 'نوع العنصر',
    filterActor: 'المستخدم',
    filterOutcome: 'النتيجة',
    filterAll: 'الكل',
    viewMetadata: 'اعرض التفاصيل',
  },
} as const;

/**
 * The «نيوز» admin: writing, editing and publishing articles.
 *
 * ⚠️ `publish` and `unpublish` are worded as the ACT, not as a state
 * («انشر المقالة», not «منشورة»), because the button performs it. A toggle
 * labelled with its current state is the single most common way an admin
 * clicks the opposite of what they meant.
 */
const adminNews = {
  title: 'نيوز',
  lead: 'المقالات اللي بتظهر في قسم نيوز على الموقع. المقالة ما بتظهرش لحد لما تنشرها.',
  create: 'مقالة جديدة',
  edit: 'تعديل',
  backToList: 'كل المقالات',
  // ── the list ──────────────────────────────────────────────────────────
  empty: 'مفيش مقالات لسه. ابدأ بواحدة.',
  colTitle: 'العنوان',
  colStatus: 'الحالة',
  colUpdated: 'آخر تعديل',
  statusDraft: 'مسودة',
  statusPublished: 'منشورة',
  // ── the editor ────────────────────────────────────────────────────────
  fieldTitle: 'العنوان',
  fieldTitleHint: 'خلّيه سؤال زي ما الطالب هيكتبه في البحث — «إيه هي الحلقة التكرارية؟» بتتبحث، «الحلقات» لأ.',
  fieldSlug: 'الرابط',
  fieldSlugHint: 'بالعربي عادي. من غير مسافات ولا نقط ولا شرطة مائلة.',
  fieldExcerpt: 'الملخّص',
  fieldExcerptHint: 'دي نفسها اللي بتظهر تحت العنوان في نتايج جوجل. ١٦٠ حرف بالكتير.',
  fieldBody: 'المقالة',
  fieldBodyHint: 'Markdown: ## للعنوان، - للنقط، ``` للكود. الـ HTML بيتعرض كنص مش بيتنفّذ.',
  fieldCourse: 'الكورس المرتبط',
  fieldCourseNone: 'من غير كورس',
  fieldCourseHint: 'المقالة بتقفل بزرار على الكورس ده. سيبه فاضي وهتقفل على صفحة الكورسات.',
  save: 'احفظ',
  saving: 'بيحفظ…',
  saved: 'اتحفظ',
  publish: 'انشر المقالة',
  unpublish: 'شيلها من النشر',
  publishing: 'بينفّذ…',
  delete: 'احذف',
  deleteConfirm: 'تحذف المقالة دي نهائي؟ مفيش رجوع.',
  // ── errors ────────────────────────────────────────────────────────────
  failed: 'مقدرناش نحفظ. حاول تاني.',
  slugTaken: 'الرابط ده مستخدم في مقالة تانية.',
  /** Shown next to the live preview so nobody wonders where it went. */
  previewTitle: 'شكلها هيبقى إزاي',
} as const;

const quizAdmin = {
  bankTitle: 'بنك الأسئلة',
  newQuestion: 'سؤال جديد',
  /**
   * The exam builder's own «write a question» entry point — see
   * `NewQuestionDialog`. Worded as «هنا» because it is the difference that
   * matters: `newQuestion` above leaves for the bank, this one does not.
   */
  newQuestionHere: 'اكتب سؤال جديد',
  newQuestionAdded: 'السؤال اتضاف للامتحان',
  /** Saved to the bank, but publishing it failed — so it is not usable yet. */
  newQuestionPublishFailed: 'السؤال اتحفظ في البنك بس مانشرش. افتحه من بنك الأسئلة واضغط «انشر السؤال».',
  /** Saved AND published, but attaching it to this exam failed. */
  newQuestionAttachFailed: 'السؤال اتحفظ واتنشر بس ماتضافش للامتحان. ضيفه من «أضف سؤال من البنك».',
  editQuestion: 'تعديل السؤال',
  duplicate: 'نسخة من السؤال',
  duplicateSuffix: '(نسخة)',
  category: 'التصنيف',
  stem: 'نص السؤال',
  generalFeedback: 'الشرح بعد الإجابة',
  graderInfo: 'ملاحظات للمصحح',
  type: 'نوع السؤال',
  types: {
    mcq_single: 'اختيار من متعدد — إجابة واحدة',
    mcq_multi: 'اختيار من متعدد — أكتر من إجابة',
    true_false: 'صح أو خطأ',
    short_answer: 'إجابة قصيرة',
    essay: 'سؤال مقالي',
  },
  options: 'الاختيارات',
  addOption: 'أضف اختيار',
  removeOption: 'احذف الاختيار',
  markCorrect: 'الإجابة الصحيحة',
  optionFeedback: 'تعليق على الاختيار',
  fraction: 'وزن الاختيار',
  answerPattern: 'نموذج الإجابة',
  addPattern: 'أضف نموذج إجابة',
  caseSensitive: 'يفرّق بين الحروف الكبيرة والصغيرة',
  wildcardHint: 'استخدم * بدل أي جزء من الإجابة',
  defaultMark: 'درجة السؤال',
  minWords: 'أقل عدد كلمات',
  maxWords: 'أكبر عدد كلمات',
  save: 'احفظ',
  publish: 'انشر السؤال',
  published: 'السؤال اتنشر — أي تعديل بعد كده هيعمل نسخة جديدة',
  versionBadge: 'نسخة {n}',
  draftBadge: 'مسودة',
  bulkImport: 'استيراد سريع',
  bulkImportHint: 'الصق الأسئلة، كل سؤال في فقرة، وحدد الإجابة بسطر ANSWER أو الإجابة',
  bulkImportExample:
    'سؤال ١: عاصمة مصر إيه؟\nA. القاهرة\nB. الإسكندرية\nC. أسوان\nANSWER: A\n\n' +
    'سؤال ٢: النيل بيجري من الجنوب للشمال\nTYPE: true\nA. صح\nB. خطأ\nANSWER: A',
  bulkImportPreview: 'معاينة {n} سؤال',
  bulkImportCommit: 'أضف الأسئلة للبنك',
  quizTitle: 'إعدادات الامتحان',
  slots: 'أسئلة الامتحان',
  addSlot: 'أضف سؤال من البنك',
  addPool: 'أضف مجموعة عشوائية',
  poolPickCount: 'عدد الأسئلة المسحوبة',
  reorderHint: 'اسحب السؤال عشان تغيّر ترتيبه',
  /* ── The question, opened in place inside the exam ───────────────────── */
  /** On the row's toggle. Says what opens, not "توسيع" — the instructor is
   *  looking for the question, not for a UI gesture. */
  slotExpand: 'افتح السؤال',
  slotCollapse: 'اقفل السؤال',
  slotLoading: 'بنجيب السؤال…',
  slotLoadFailed: 'مقدرناش نجيب السؤال',
  slotRetry: 'جرّب تاني',
  /** The mark that counts HERE, said in full so it cannot be read as the
   *  bank's default — the two are different numbers and the form below
   *  deliberately does not show the other one. */
  slotMark: 'الدرجة في الامتحان ده',
  slotMarkFailed: 'الدرجة مااتحفظتش',
  /** Above the editor, whenever the entry is attached to more than one quiz.
   *  An edit here is an edit everywhere, and that has to be said before the
   *  instructor types, not after they save. */
  slotSharedWarning: 'السؤال ده مستخدم في {n} امتحان — أي تعديل هنا بيتغيّر فيهم كلهم.',
  /** Saving bumps the bank entry to a new DRAFT version, and a slot with no
   *  pinned version serves the latest READY one. So an unpublished edit is
   *  invisible to students, and this is the only place that says so. */
  slotDraftPending: 'التعديل اتحفظ كمسودة — الطالب لسه شايف النسخة القديمة لحد ما تنشره.',
  durationMinutes: 'مدة الامتحان بالدقايق',
  openFromLabel: 'يفتح من',
  openUntilLabel: 'يقفل في',
  passPercent: 'نسبة النجاح',
  /** The admin FIELD label. `copy.quiz.totalMarks` is a student-facing
   *  template carrying a `{marks}` placeholder, and was being rendered here
   *  as a label — so the form showed a literal «الدرجة الكلية {marks}». */
  gradeOutOf: 'الامتحان من كام درجة',

  // ── The two papers ────────────────────────────────────────────────────
  /** The improvement toggle. Only rendered on a course's final exam. */
  allowsImprovement: 'اسمح بامتحان تحسين',
  allowsImprovementHint:
    'الطالب ياخد محاولة واحدة زيادة على ورقة تانية، وأعلى درجة هي اللي بتتحسب.',
  /** Only a course exam may offer one, so the toggle is hidden elsewhere. */
  improvementExamOnly: 'التحسين متاح للامتحان النهائي بس',
  paperSwitchLabel: 'الورقة اللي بتحرّرها',
  papers: { original: 'الورقة الأصلية', improvement: 'ورقة التحسين' },
  paperEmpty: 'الورقة دي لسه فاضية — ضيف أسئلة قبل ما تنشر.',
  paperCount: '{n} سؤال · {marks} درجة',
  /** The publish guard's two refusals, stated where the admin can act. */
  improvementPaperEmpty: 'مينفعش تنشر امتحان بتحسين وورقة التحسين فاضية.',
  improvementPaperShared:
    'ورقة التحسين فيها {n} سؤال موجود في الورقة الأصلية. غيّرهم عشان التحسين يبقى امتحان حقيقي.',
  singleAttemptNote: 'كل كويز ليه محاولة واحدة. مفيش إعادة.',
  reviewMatrixReset: 'رجّع الإعداد الافتراضي',
  shuffleQuestions: 'رتّب الأسئلة عشوائيًا',
  shuffleOptions: 'رتّب الاختيارات عشوائيًا',
  navMethod: 'التنقل بين الأسئلة',
  navFree: 'حر',
  navSequential: 'بالترتيب',
  overdueHandling: 'لما الوقت يخلص',
  overdueAutosubmit: 'يتسلّم تلقائيًا',
  overdueGrace: 'مهلة إضافية للتسليم',
  overdueAbandon: 'المحاولة تتلغي',
  graceSeconds: 'مهلة التسليم بالثواني',
  reviewMatrix: 'إيه اللي الطالب يشوفه',
  windows: {
    during: 'أثناء المحاولة',
    immediatelyAfter: 'بعد التسليم مباشرة',
    laterWhileOpen: 'بعد كده والامتحان مفتوح',
    afterClose: 'بعد ما الامتحان يقفل',
  },
  flags: {
    response: 'إجابته',
    correctness: 'صح ولا غلط',
    marks: 'الدرجات',
    specificFeedback: 'تعليق كل اختيار',
    generalFeedback: 'الشرح العام',
    rightAnswer: 'الإجابة الصحيحة',
    overallFeedback: 'تعليق النتيجة',
  },
  attemptsTitle: 'محاولات الطلاب',
  unlock: 'افتح المحاولة',
  reopen: 'ارجّع المحاولة للطالب',
  grantAttempt: 'امنح محاولة إضافية',
  grantTime: 'امنح وقت إضافي',
  grantTimeMinutes: 'دقايق إضافية',
  analyticsTitle: 'تحليل الامتحان',
  scoreDistribution: 'توزيع الدرجات',
  facilityIndex: 'معامل السهولة',
  discriminationIndex: 'معامل التمييز',
  distractorAnalysis: 'تحليل الاختيارات',
  attemptCount: '{n} محاولة',
  tooFewAttempts: 'محتاجين {n} محاولة على الأقل عشان الأرقام تبقى معبّرة',
  averageScore: 'متوسط الدرجات',
  medianScore: 'الوسيط',
  passRate: 'نسبة النجاح',
  newCategory: 'فئة جديدة',
  categoryNamePlaceholder: 'اسم الفئة',
  noCategories: 'مفيش فئات لسه — أضف واحدة',
  questionsEmpty: 'مفيش أسئلة في البنك لسه',
  search: 'دور بالنص...',
  searchQuestions: 'دور على سؤال...',
  shortcutsHint: 'Ctrl/⌘+Enter للحفظ — Escape للإغلاق — Enter في آخر اختيار يضيف اختيار جديد',
  showWeights: 'وزن الاختيار (متقدم)',
  publishQuiz: 'انشر الامتحان',
  slotsEmpty: 'مفيش أسئلة في الامتحان لسه',
  slotRemove: 'احذف السؤال من الامتحان',
  poolName: 'اسم المجموعة',
  poolPoints: 'درجة كل سؤال في المجموعة',
  /** Aliased: also the aria-label prefix on the student question navigator. */
  columnQuestion: student.common.question,
  columnN: 'عدد المحاولات',
  distractorPicks: '{n} اختار',
  columnStudent: 'الطالب',
  columnQuiz: 'الامتحان',
  columnState: 'الحالة',
  columnScore: 'الدرجة',
  columnStarted: 'وقت البدء',
  columnDeadline: 'الموعد النهائي',
  columnActions: 'إجراءات',
  stateInProgress: 'شغال',
  stateOverdue: 'اتأخر',
  stateSubmitted: 'اتسلّم',
  statePendingReview: 'محتاج تصحيح',
  stateAbandoned: 'اتلغى',
  filterAll: 'الكل',
  searchStudent: 'دور بالاسم...',
  needsGradingOnly: 'محتاج تصحيح بس',
  confirmReopen: 'متأكد إنك عايز ترجّع المحاولة دي للطالب؟',
  extraSecondsLabel: 'ثواني إضافية',
  grantAttemptConfirm: 'امنح الطالب ده محاولة إضافية؟',
  actionSucceeded: 'اتنفّذ',
  actionFailed: 'مقدرناش ننفّذ الإجراء — حاول تاني',
} as const;

/**
 * The full table, student namespaces included — see the header for why this
 * composes rather than replaces. Property order is irrelevant; the three admin
 * keys go last only so a reader can see at a glance what this file adds.
 */
export const copy = { ...student, admin, adminNews, quizAdmin } as const;

export type AdminCopy = typeof copy;
