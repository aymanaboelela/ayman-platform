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
    errors: 'الأعطال',
    audit: 'سجل النشاط',
    settings: 'الإعدادات',
    /** المساعد's inbox. Sits in the teaching group — it is student contact,
     *  not site configuration. */
    inbox: 'صندوق الوارد',
    /** «رسايل م. أيمن». Teaching group too, and directly under the inbox: the
     *  two screens are the two directions of the same conversation. */
    assistantQuestions: 'أسئلة الطلبة',
    outreach: 'رسايلي للطلبة',
    /** Vodafone Cash review queue. */
    payments: 'المدفوعات',
    /** «مين دفع، قد إيه، وهيخلص إمتى» — the money side of `payments` above:
     *  that screen reviews a CLAIM, this one reports the SUBSCRIPTIONS it
     *  produced. */
    finance: 'الاشتراكات والإيرادات',
    /** الكتاب الورقي — the shipping queue. */
    books: 'طلبات الكتب',
    // ── قسم التسويق — واتساب برة المنصة، لأول مرة. غير من «رسايلي للطلبة»
    // (outreach) اللي بتتبعت جوه المنصة نفسها لكل طالب بمناسبة حصلت له.
    marketing: 'التسويق',
    // ── Sidebar group headings. The nav is eleven links long; ungrouped,
    //    it reads as one undifferentiated list and nobody scans it.
    groupTeaching: 'التدريس',
    groupSite: 'الموقع',
    groupSystem: 'النظام',
    groupMarketing: 'التسويق',
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
    deleteConfirm: 'الإجراء ده مش هيترجع.',
    required: 'الحقل ده مطلوب',
    publish: 'نشر',
  },
  /**
   * The course editor's ONE status read-out, which replaced the «حفظ» button
   * that used to sit under every block on the page.
   *
   * The wording carries the rule, because the rule is the reassurance: nothing
   * here has to be saved, and nothing here is visible to a student until it is
   * published. An editor who does not know that reads a page with no save
   * button as a page that is losing their work.
   */
  autosave: {
    idle: 'كل حاجة بتتحفظ لوحدها كمسودة',
    saving: 'بيحفظ…',
    saved: 'اتحفظ',
    error: 'مااتحفظش',
    retry: 'نجرّب تاني',
    /** `aria-label` on the read-out, which is otherwise three words of status
     *  with no clue what they describe. */
    region: 'حالة حفظ الكورس',
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
    body: 'حصل خطأ على السيرفر والصفحة مااتعرضتش. ولو كان فيه حفظ في نصه، مش مضمون إنه عدّى — تحميل الصفحة تاني وتأكيد من آخر تغيير قبل الكمالة.',
    /** Sits beside the digest. The number is only useful to someone who knows
     *  it also appears in the server log, and nothing else on this screen
     *  says so. */
    digestHint: 'الكود ده موجود جنب تفاصيل الخطأ في لوج السيرفر',
  },
  course: {
    listTitle: 'الكورسات',
    /** Under the title on the list. The grid shows covers, so it says what a
     *  missing one means — otherwise the generated scene reads as a bug. */
    listLead: 'كل الكورسات — المنشور والمسودة. اللي مالوش صورة بياخد شكل تلقائي من لون المادة.',
    new: 'كورس جديد',
    /** On a card, before the date. */
    lastUpdated: 'آخر تعديل',
    /** The card's badge for `requiresGrant`. The switch that sets it is worded
     *  as the ACT («قفل الكورس ده»); this is the STATE, so it is one word. */
    lockedBadge: 'مقفول',
    /** The per-card action, next to «معاينة». */
    open: 'افتح',
    /** Only on a published course — the public page it links to is a 404
     *  while it is still a draft. */
    preview: 'معاينة',
    title: 'اسم الكورس',
    edit: 'تعديل الكورس',
    /**
     * The six blocks the editor's form is cut into (`FormSection`).
     *
     * Each `…Note` is ONE sentence and says what the block decides, not what
     * the fields are — the labels already name those. «الكتاب الورقي» is its
     * own block rather than two inputs at the end of the pricing one because
     * it is a different product with a different price and a different
     * fulfilment (a delivery, not an unlock), and sharing a heading with the
     * subscription plans is exactly how a book price gets read as one.
     */
    sectionBasics: 'المعلومات الأساسية',
    sectionBasicsNote: 'الاسم والرابط والوصف — ده اللي بيظهر في قوايم الكورسات وفي نتايج البحث.',
    sectionTaxonomy: 'التصنيف والمنهج',
    sectionTaxonomyNote: 'النظام والصف والمسار والمادة، ومين شايف الكورس من الشُّعَب.',
    sectionCover: 'صورة الكورس',
    sectionCoverNote: 'بتظهر على كارت الكورس وفي لوحة الطالب.',
    sectionPricing: 'الاشتراك والتسعير',
    sectionPricingNote: 'أسعار الاشتراك بالجنيه. أي سعر بتحطه بيقفل الكورس تلقائيًا.',
    sectionBook: 'الكتاب الورقي',
    sectionBookNote: 'كتاب المادة اللي الطالب يطلبه ويتشحنله. مالوش علاقة خالص بسعر الاشتراك.',
    sectionExtras: 'الشارة والملاحظات',
    sectionExtrasNote: 'سطور بتظهر على الكارت وصفحة الكورس — مش بتتحكم في وصول حد.',
    /**
     * The switch that lets the platform say «خلصت الكورس» at all.
     *
     * Worded as a statement about the CONTENT, not about the student: what it
     * answers is «نزل كل المنهج ولا لسه؟», and nothing about access or grading
     * moves when it flips.
     */
    contentComplete: 'المنهج نزل كله',
    contentCompleteHint:
      'سيبها فاضية طول ما لسه فيه محاضرات جاية. لغاية ما تعلّمها، الطالب اللي خلّص اللي نازل هيقرا «خلّصت اللي نزل» مش «خلصت الكورس».',
    /** The «⋯» trigger in the editor bar: archive, delete, and the video check. */
    moreActions: 'إجراءات تانية',
    slug: 'المُعرّف في الرابط',
    slugHint: 'حروف إنجليزي صغيرة وأرقام وشرطات — ده اللي بيظهر في العنوان',
    /** The 409 from `updateCourseAction`, which is always the slug. */
    slugTaken: 'الرابط ده مستخدم في كورس تاني. غيّره وجرّب تاني.',
    /**
     * A new course is created with these two already in it, so the instructor
     * lands on a lecture to fill in rather than on an empty page whose only
     * control makes a section. Both are ordinary draft rows and both rename in
     * place — they are a starting point, not a decision.
     */
    firstSectionTitle: 'المقدمة',
    firstLessonTitle: 'المحاضرة الأولى',
    /**
     * The 400 from `updateCourseAction`, which is effectively always
     * `assertOfferingExists`: the (نظام، صف، مسار، مادة) combination has no row
     * in `subject_offerings`, so the course cannot be saved at all until one of
     * the four is changed.
     *
     * It used to arrive as the generic «الحفظ فشل — التغييرات اترجعت زي ما
     * كانت», which names neither the cause nor anything to do about it — and
     * says something untrue besides, since nothing is reverted.
     */
    offeringMissing:
      'التركيبة دي (نظام + صف + مسار + مادة) مش موجودة في المناهج، فمينفعش الكورس يتحفظ بيها. لازم واحد منهم يتغيّر.',
    /**
     * The option that HOLDS a course's existing subject when the picker's
     * list does not contain it. Unnamed on purpose — the taxonomy no longer
     * offers this subject here, so there is no `nameAr` to show, and
     * inventing one would be worse than saying plainly that this is what the
     * course has now.
     */
    subjectCurrent: 'المادة الحالية (تفضل زي ما هي)',
    subtitle: 'وصف مختصر',
    description: 'الوصف',
    system: 'النظام الدراسي',
    year: 'الصف الدراسي',
    track: 'المسار',
    trackNoneYear1: 'الصف الأول مالوش مسار',
    subject: 'المادة',
    subjectEmpty: 'مفيش مواد متاحة للاختيار ده — نظام أو صف أو مسار تاني',
    status: 'الحالة',
    statusDraft: 'مسودة',
    statusPublished: 'منشور',
    statusArchived: 'مؤرشف',
    publish: 'نشر',
    unpublish: 'رجّعه مسودة',
    publishBlocked: 'لازم يكون فيه محاضرة منشورة واحدة على الأقل',
    /**
     * THE one button.
     *
     * Publishing used to be four independent flags — the course, every section,
     * every lesson, and a quiz's own — so finishing a course meant hunting down
     * and pressing each of them in the right order, and getting it wrong
     * published a course that showed students nothing.
     *
     * Everything else on the page saves itself as a draft, which is «حتى لو ما
     * كملتش، اتخزنت بس ما اتنشرتش». This is the only press that changes what a
     * student can see, so it says so out loud.
     */
    publishAll: 'انشر الكورس كله',
    publishAllHint: 'هينشر الكورس وكل محاضرة جاهزة جواه. اللي لسه ناقص هيفضل مسودة.',
    publishAllConfirm: 'الكورس وكل المحاضرات الجاهزة هيبقوا ظاهرين للطلبة. تمام؟',
    /** Rendered as «اتنشرت ٧ محاضرة». */
    publishAllDone: 'اتنشرت',
    publishAllLessons: 'محاضرة',
    /** The heading over the list of what stayed a draft, and why. */
    publishAllSkipped: 'ما اتنشرتش عشان لسه ناقصة:',
    publishSkipNoVideo: 'مافيهاش فيديو',
    publishSkipNoText: 'مافيهاش محتوى',
    publishSkipNoResources: 'مافيهاش مواد مرفوعة',
    publishSkipQuizNotPublished: 'الاختبار بتاعها لسه مش منشور',
    /**
     * The whole-course video check.
     *
     * The per-lecture check answers when a link is pasted; this answers for a
     * course that is already live, where a video can go private months later
     * and the first report is a student saying «مش شغال». Named lectures, not a
     * count — the point is knowing WHICH one to go and fix.
     */
    videoCheck: 'افحص فيديوهات الكورس',
    videoCheckHint: 'بيسأل يوتيوب عن كل فيديو في الكورس ويقول لك المكسور منهم.',
    videoCheckRunning: 'بنسأل يوتيوب…',
    /** Rendered as «كل الفيديوهات شغالة (٧)». */
    videoCheckAllGood: 'كل الفيديوهات شغالة',
    videoCheckProblems: 'الفيديوهات دي فيها مشكلة:',
    videoCheckNoVideo: 'مافيهاش فيديو أصلاً',
    videoCheckBlocked: 'التضمين مقفول — شغّال على يوتيوب بس',
    videoCheckUnavailable: 'يوتيوب بيقول مش متاح (private أو متمسوح)',
    videoCheckUnknown: 'مقدرناش نتأكد منه',
    videoCheckFailed: 'الفحص مانجحش — نجرّب تاني',
    // I4 (audit): a course with student quiz attempts can never be
    // hard-deleted — attempt_events is append-only at the database level,
    // by design, forever. Archiving (not unpublishing back to draft) is
    // the correct action: it is a distinct, permanent retirement state,
    // not "still being worked on".
    deleteBlockedAttempts: 'الكورس ده فيه محاولات امتحانات لطلبة، فمينفعش يتمسح خالص — أرشفه بدل ما تمسحه',
    archiveConfirm: 'نأرشف الكورس ده؟ هيتشال من واجهة الطلبة.',
    restoreConfirm: 'نرجّع الكورس ده مسودة؟',
    deleteConfirm: 'نمسح الكورس ده؟ الإجراء ده مش هيترجع.',
    empty: 'مفيش كورسات لسه',
    cover: 'صورة الكورس',
    coverHint: 'بتظهر في صفحة الكورسات وفي لوحة الطالب. أحسن مقاس ١٦:٩.',
    /**
     * The course's access policy, in the instructor's words.
     *
     * Still not «مدفوع» here — the checkbox itself only closes the course to
     * new students; it says nothing about money. Once a price is set below it
     * closes automatically, and THAT is what makes it paid — see
     * `priceHint`.
     */
    requiresGrant: 'قفل الكورس ده',
    requiresGrantHint:
      'الكورس هيبقى مقفول على أي حد جديد لحد ما تفتحه له بنفسك. الطلبة المشتركين قبل كده هيكمّلوا عادي، والمحاضرات اللي عليها «معاينة مجانية» هتفضل مفتوحة للكل.',
    priceMonthly: 'اشتراك شهري (جنيه)',
    priceQuarterly: 'اشتراك ٣ شهور (جنيه)',
    priceYearly: 'اشتراك سنة كاملة (جنيه)',
    priceNotForSale: 'مش للبيع',
    priceHint:
      'سيبهم فاضيين لو الكورس مجاني. أول ما تحط سعر لأي باقة، الكورس بيتقفل أوتوماتيك على أي حد جديد لحد ما يدفع ويتعمله موافقة — بالظبط زي «قفل الكورس ده» فوق.',
    /** الكتاب الورقي — entirely independent of the subscription prices
     *  above; a free course can sell a book, and a priced one can sell none. */
    bookTitle: 'اسم الكتاب',
    bookPrice: 'سعر الكتاب (جنيه)',
    bookNone: 'من غير كتاب',
    /** The chip in the book block's heading. It reads the PAIR, not one
     *  field: a title with no price sells nothing (`formDataOf` drops both),
     *  so «مفيش كتاب» beside a filled-in title is the warning. */
    bookOn: 'الكتاب متاح للطلب',
    bookOff: 'مفيش كتاب',
    bookHint:
      'سيبهم فاضيين لو الكورس ده مالوش كتاب ورقي. أول ما تحط اسم وسعر، هيظهر «اطلب الكتاب» في صفحة الكورس.',
    /**
     * The card's badge. NOT an access control, and the hint says so out loud —
     * the switch above it IS one, they sit in the same form, and an instructor
     * who confuses the two would think «اختياري» had closed a course.
     */
    emphasis: 'شارة الكورس',
    emphasisHint:
      'بتظهر على كارت الكورس للطالب. دي بتقوله الكورس ده مهم قد إيه بالنسباله — مابتقفلش ولا بتفتح حاجة، الكورس يفضل مفتوح زي ما هو.',
    emphasisNone: 'من غير شارة',
    emphasisNote: 'سطر تحت الشارة',
    emphasisNotePlaceholder: 'أساسي لأولى بكالوريا · اختياري لتانية',
    emphasisNoteHint: 'اختياري. اكتب فيه الشارة دي بتخص مين — بيظهر تحتها على الكارت.',
    /**
     * Independent of the emphasis badge above — this shows on the public
     * course page (and the enrolled-course card) whenever the course has
     * ZERO real lectures published yet, badge or no badge. Left blank, the
     * page falls back to the platform's own stock sentence — see the
     * field's own note on `Course.comingSoonNote` in schema.prisma.
     */
    comingSoonNote: 'رسالة «لسه هننزل قريبًا»',
    comingSoonNotePlaceholder: 'المحاضرات بتتصور دلوقتي، هتتنزل الأسبوع الجاي',
    comingSoonNoteHint:
      'بتظهر بدل الدروس لو الكورس لسه مفيهوش محاضرة حقيقية منشورة، وميمنعش الاشتراك خالص. سيبها فاضية عشان تستخدم الجملة الافتراضية.',
  },
  /**
   * الترم الأول / الترم الثاني — a division of the course's own content, not
   * a pricing concept bolted on top of it. See `CourseTerm`'s model doc.
   */
  term: {
    title: 'الترمين',
    lead: 'قسّم محتوى الكورس لترمين — كل قسم تقدر تحطه جوه ترم، والسويتش هنا بيفتح أو يقفل البيع والوصول للترم ده بس.',
    empty: 'الكورس ده لسه من غير ترمين.',
    titleLabel: 'اسم الترم',
    priceLabel: 'سعر الترم',
    open: 'مفتوح',
    closed: 'مقفول',
    toggleLabel: 'فتح/قفل الترم',
    addTerm: 'ترم جديد',
    /** `{n}` — how many students just lost live access. Shown the instant a
     *  term closes, so the admin sees the cascade actually happened rather
     *  than trusting a switch that flipped silently. */
    closedRevoked: 'اتقفل الترم، وسحبنا الوصول من {n} طالب كان مشترك فيه.',
    closedNoOne: 'اتقفل الترم — محدش كان مشترك فيه لسه.',
    reopened: 'اتفتح الترم تاني للاشتراك.',
    actionFailed: 'حصل خطأ، حاول تاني',
    /** The section editor's own "which term" dropdown. */
    assignLabel: 'الترم',
    unassigned: 'بدون ترم',
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
    // The disclosure button in a section header. It is an icon-only control
    // whose chevron is `aria-hidden`, so without a label it announces nothing —
    // and it is the only thing in that row that opens the section, now that the
    // header is no longer a `<summary>`.
    expand: 'فتح القسم',
    collapse: 'اطوِ القسم',
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
    durationRetry: 'نجرّب تاني',
    /** The API's own refusal, when a save arrives with no duration and the
     *  server's probe could not find one either. */
    /**
     * ⚠️ It does NOT say «اتأكد إن الفيديو متاح للعامة» any more.
     *
     * That sentence blamed the video, and the commonest cause is the opposite:
     * YouTube served our SERVER a bot challenge instead of the page. Sending an
     * instructor to check a video that was never the problem is the same false
     * accusation the embed check had to be fixed for.
     */
    durationUnavailable:
      'يوتيوب مارضيش يقول مدة الفيديو للسيرفر دلوقتي — ده بيحصل أحياناً ومالوش علاقة بالفيديو. المدة تتكتب بالثواني، أو نجرّب تاني بعد شوية.',
    /**
     * The embed check, which the duration alone could never answer.
     *
     * A video whose «السماح بالتضمين» is off still has a watch page, so the
     * duration probe succeeds and the lecture saves looking perfect — and then
     * every student who taps it gets «الفيديو مش متاح دلوقتي». These are the
     * instructor's copy of that message, said BEFORE it reaches a student, and
     * `embedBlocked` names the exact switch to go and flip.
     */
    embedChecking: 'بنتأكد إن الفيديو هيشتغل جوه المنصة…',
    embedOk: 'الفيديو هيشتغل جوه المنصة',
    embedBlocked:
      'الفيديو ده متقفول عليه التضمين، يعني هيشتغل على يوتيوب بس ومش هيشتغل جوه المنصة. افتحه في YouTube Studio ← تفاصيل ← اختيارات أخرى، وفعّل «السماح بالتضمين».',
    embedUnavailable:
      'يوتيوب بيقول إن الفيديو ده مش متاح — يا إما private، يا إما اتمسح، يا إما عليه قيد سن أو بلد. الطلبة مش هيعرفوا يشوفوه.',
    embedUnknown: 'مقدرناش نتأكد إن الفيديو هيشتغل — راجعه بنفسك قبل ما تنشر.',
    /**
     * Watching the lecture from the admin, which was impossible: the only
     * player is the student route, and that one is gated on an active enrolment
     * with no role bypass — so an instructor checking their own video got a 404.
     */
    preview: 'معاينة المحاضرة',
    previewPlay: 'تشغيل الفيديو',
    previewClose: 'قفل المعاينة',
    previewOnYouTube: 'افتحه على يوتيوب',
    /** Wipes the `lesson_videos` row. The action existed with NO caller at all,
     *  so a wrong link could be replaced but never removed. */
    removeVideoDone: 'الفيديو اتشال',
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
    addQuiz: 'إضافة اختبار للمحاضرة',
  },
  exam: {
    title: 'امتحان الكورس',
    hint: 'محاضرة من نوع «اختبار» تبقى امتحان الكورس النهائي. مش بتتفتح للطالب غير لما كل المحاضرات التانية تخلص، ولازم النجاح فيها عشان الكورس يتحسب خلص.',
    none: 'من غير امتحان',
    save: 'حفظ',
    noQuizLessons: 'لازم تعمل محاضرة من نوع «اختبار» الأول.',
    current: 'الامتحان الحالي',
    scaffold: 'أضف امتحان الكورس',
    open: 'فتح الامتحان',
    scaffoldFailed: 'مقدرناش نعمل الامتحان — نجرّب تاني',
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
    /**
     * The partial unique index `lesson_resources_one_presentation` — one
     * «بريزنتيشن أساسي» per lecture — reaching the instructor as a sentence
     * instead of a 500.
     *
     * It arrived as a raw `POST /api/admin/lessons/…/resources failed with
     * 500: {"statusCode":500,…}` printed into an RTL panel, which is both
     * unreadable and unactionable. The rule itself is fine and deliberate; it
     * simply had no voice.
     */
    presentationExists:
      'المحاضرة دي فيها بريزنتيشن أساسي واحد خلاص. القديم يتمسح الأول، أو ده يتضاف كـ«ملف».',
    /** Any other refusal from the add endpoint — never the transport's own
     *  English, which is what used to be shown. */
    addFailed: 'مقدرناش نضيف المادة دي. نجرّب تاني.',
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
    fileDropHint: 'سحب الملف هنا، أو دوسة للاختيار',
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
    uploadNetwork: 'النت قطع في نص الرفع. نجرّب تاني.',
    uploaded: 'الملف اترفع',
    /** Why «أضف مادة» is greyed out — shown right next to it, never alone. */
    needsFile: 'الملف الأول',
    remove: 'حذف',
    empty: 'لسه مفيش مواد. نبدأ بالبريزنتيشن الأساسي.',
    onePresentationOnly: 'فيه بريزنتيشن أساسي واحد بس لكل محاضرة.',
    edit: 'تعديل',
    save: 'حفظ',
    cancel: 'إلغاء',
  },
  reorder: {
    hint: 'سحب لإعادة الترتيب، أو زر المسافة والأسهم من الكيبورد',
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
    greeting: 'أهلًا وسهلاً',
    statStudents: 'طالب مسجّل',
    statPublished: 'كورس منشور',
    statDrafts: 'كورس مسودة',
    statsUnavailable: 'الأرقام مش متاحة دلوقتي — تحديث الصفحة',
    sectionsTitle: 'أقسام اللوحة',
    sectionsLead: 'كل قسم بيتحكّم في حتة من اللي الطالب بيشوفه.',
    quickTitle: 'إجراءات سريعة',
    quickNewCourse: 'كورس جديد',
    quickHomeBlocks: 'أقسام الصفحة الرئيسية',
    quickMedia: 'رفع صورة',
    /** Above the section grid, beside the group heading. */
    statPendingPayments: 'دفعة مستنية مراجعة',
    statUnshippedBooks: 'كتاب لسه ما اتشحنش',
    statUnreadInbox: 'رسالة مستنية رد',
    /** The heading over the live queues, which only render when non-zero. */
    waitingTitle: 'محتاج تصرّف',
    waitingNone: 'مفيش حاجة مستنياك دلوقتي.',
  },

  /**
   * One line per admin section, shown under its name on `/admin`.
   *
   * The overview used to be twenty identical dark rectangles carrying an icon
   * and a word — a menu drawn twice, once in the sidebar and once in the page,
   * with the page's copy adding nothing the sidebar had not already said. A
   * sentence per tile is what makes it a directory instead: it answers «القسم
   * ده بيعمل إيه» for someone who has not opened it in a month.
   *
   * Keyed by `href` so the table and this map cannot drift apart silently —
   * `navBlurb[item.href]` is `undefined` for a section with no line yet, and
   * the tile simply renders without one.
   */
  navBlurb: {
    '/admin/courses': 'اعمل كورس، رتّب محاضراته، وانشره.',
    '/admin/students': 'دوّر على طالب، افتح سجله، أو اقفل حسابه.',
    '/admin/payments': 'راجع تحويلات فودافون كاش واقبلها أو ارفضها.',
    '/admin/finance': 'الإيرادات والمصروفات وصافي الربح.',
    '/admin/books': 'طلبات الكتاب المدفوعة اللي لسه ما اتشحنتش.',
    '/admin/attempts': 'محاولات الامتحانات ودرجاتها.',
    '/admin/analytics': 'أداء الطلبة وأصعب الأسئلة.',
    '/admin/inbox': 'رسايل الطلبة والرد عليها.',
    '/admin/outreach': 'سجل الرسايل اللي اتبعتت باسمك.',
    '/admin/assistant': 'الأسئلة اللي الطلبة بيسألوها للمساعد.',
    '/admin/taxonomy': 'الأنظمة والصفوف والمسارات والمواد.',
    '/admin/marketing/campaigns': 'حملات واتساب للي لسه بره المنصة.',
    '/admin/home': 'أقسام الصفحة الرئيسية وترتيبها.',
    '/admin/navigation': 'روابط الهيدر والفوتر.',
    '/admin/media': 'الصور المرفوعة وروابطها.',
    '/admin/news': 'الأخبار والإعلانات.',
    '/admin/settings/branding': 'الهوية والسيو وبيانات التواصل.',
    '/admin/flags': 'تشغيل وإطفاء مميزات المنصة.',
    '/admin/errors': 'الأخطاء اللي حصلت في المنصة.',
    '/admin/audit': 'مين عمل إيه وإمتى.',
  } as Record<string, string | undefined>,
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
    upload: 'رفع صورة',
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
    vodafoneCash: 'رقم فودافون كاش',
    vodafoneCashHint: 'الرقم اللي الطلبة هيحوّلوا عليه اشتراك الكورسات المدفوعة. بصيغة دولية زي رقم الهاتف فوق.',
    accentPreviewLabel: 'معاينة اللون',

    /**
     * The four channels the site footer renders that the dashboard could not
     * reach. Two of them (`whatsappChannel`, `facebookGroup`) shipped as bare
     * platform roots — `https://wa.me/` and `https://www.facebook.com/groups/`
     * — so every student who tapped them landed on WhatsApp's or Facebook's
     * own front page. See `ContactSchema`.
     */
    instagram: 'إنستجرام',
    tiktok: 'تيك توك',
    whatsappChannel: 'قناة واتساب',
    whatsappChannelHint: 'لينك القناة نفسها، مش رقم',
    /**
     * A third WhatsApp field, and the three are genuinely different things —
     * a number, a broadcast channel, and a group students can talk in. This is
     * the one «رسايل م. أيمن» invites students into, and it does NOT fall back
     * to the channel: a message promising «جروب الواتساب مستنيك» over a
     * read-only channel is a promise the link cannot keep.
     */
    whatsappGroup: 'جروب واتساب للطلبة',
    whatsappGroupHint: 'لينك الجروب — ده اللي بيتبعت للطلبة في رسايلك. سيبه فاضي والدعوة مش هتتبعت أصلاً.',
    facebookGroup: 'جروب فيسبوك',
    facebookGroupHint: 'لينك الجروب اللي الطلبة بيتجمعوا فيه',

    /**
     * `<AssetPicker>` — the settings-side image field.
     *
     * It replaced a bare `<select>` of filenames, which is why «معاينة» is
     * worth naming at all: choosing `IMG_4821.webp` from a dropdown and
     * pressing save told an admin nothing about what they had just put in the
     * browser tab.
     */
    assetPreviewAlt: 'معاينة الصورة المختارة',
    assetChooseExisting: 'من المكتبة',
    assetUploadNew: 'رفع صورة جديدة',
    assetMissing: 'الصورة المختارة مش موجودة — يمكن اتمسحت',
  },
  /**
   * `/admin/outreach` — «رسايل م. أيمن».
   *
   * The screen answers three questions in this order, and the order is the
   * design: what went out under my name (the log), does it read like me (the
   * preview), and do I want it to keep happening (the switches). A settings
   * page that led with the switches would be asking him to configure something
   * he has never seen.
   */
  /* ── أسئلة المساعد ────────────────────────────────────────────────────
   *
   * The screen that turns the chat from a black box into a source of work:
   * every question a student typed, and a flag on the ones المساعد could not
   * answer. Each of those is a missing entry in `copy.assistant.knowledge`,
   * already phrased the way the next student will phrase it.
   *
   * Same gender rule as everywhere else — nothing here is second person, so
   * nothing here has to guess who is reading it.
   */
  assistantQuestions: {
    eyebrow: 'المساعد',
    title: 'أسئلة الطلبة',
    lead: 'كل سؤال اتكتب في الشات، والرد اللي راح عليه. اللي عليه علامة معناه إن المساعد وقف قدامه — ودي أهم صف في الصفحة.',
    empty: 'لسه محدش سأل حاجة.',
    emptyFiltered: 'مفيش سؤال وقف قدام المساعد في الفترة دي.',
    /** The one filter, and the actionable one. */
    filterAll: 'كل الأسئلة',
    filterEscalated: 'اللي وقف قدامه',
    searchPlaceholder: 'دوّر في الأسئلة…',
    /** Column headings. */
    question: 'السؤال',
    answer: 'الرد',
    student: 'الطالب',
    askedAt: 'إمتى',
    /** A visitor who was never signed in. Not a name, and not «مجهول» either —
     *  the honest word is that there was no account, not that we lost one. */
    visitor: 'زائر من غير حساب',
    /** The badge on a row المساعد handed over. */
    escalated: 'محتاج أيمن',
    /**
     * Which model answered. A page of «من الكلام المكتوب» means the keys ran
     * out — a different problem from «الردود وحشة», and the only column that
     * tells them apart.
     */
    byModel: 'رد بالذكاء الاصطناعي',
    byScript: 'من الكلام المكتوب',
    /** Under the title, said once. */
    retention: 'الأسئلة بتتشال لوحدها بعد ٩٠ يوم.',

    // ── هل ده اتحول لمحادثة؟ ─────────────────────────────────────────
    // البادج التاني على صف «محتاج أيمن»: مش بس إن المساعد وقف قدامه، لكن هل
    // حد كلّم الطالب ده فعلاً ولا لأ. ده اللي بيمنع سؤال يضيع من غير ما حد
    // يشوفه.
    /** A signed-in student, escalated, and no conversation ever opened. */
    needsAttention: 'لسه محدش كلّمه',
    /** A signed-in student who has (or has had) a real conversation. */
    hasConversation: 'اتحول لمحادثة',
    /** A visitor with no account — there is no way to reach them again. */
    guestUnreachable: 'زائر — مفيش طريقة نلاقيه تاني',
    openConversation: 'افتح المحادثة',

    // ── نافذة التفاصيل: باقي أسئلة نفس الزيارة ───────────────────────
    detailTitle: 'السؤال ده',
    siblingsTitle: 'باقي اللي سأله في نفس الوقت تقريبًا',
    siblingsEmpty: 'ده السؤال الوحيد منه في الفترة دي.',
    siblingsGuestNote: 'زائر من غير حساب — مينفعش نربط أسئلته ببعض.',
  },

  outreach: {
    eyebrow: 'رسايلك',
    title: 'رسايلي للطلبة',
    lead: 'المنصة بتبعت للطالب رسالة باسمك بعد كل امتحان، ولو كويز اتساب من غير حل، ولو درس خلص. كل رسالة بصيغة مختلفة — مفيش تكرار.',

    // ── the strip ────────────────────────────────────────────────────
    statSent: 'رسايل اتبعتت',
    statRecent: 'آخر ٣٠ يوم',
    statSeen: 'الطالب فتحها',
    statReplied: 'وصل رد',
    statRepliedHint: 'أقوى إشارة إن الرسالة وصلت فعلاً',
    /** `{date}` — the activation floor. */
    activeSince: 'المنصة بتكتب عن اللي حصل بعد {date} بس — اللي قبل كده مش هيتبعت عنه حاجة.',

    // ── the log ──────────────────────────────────────────────────────
    logTitle: 'اللي اتبعت',
    logEmpty: 'لسه مفيش رسايل اتبعتت.',
    logEmptyHint: 'أول ما طالب يخلّص كويز، هتلاقي الرسالة اللي راحتله هنا بالنص بتاعها.',
    filterAll: 'الكل',
    openThread: 'فتح المحادثة',
    seen: 'اتقرت',
    unseen: 'لسه ما اتقرتش',
    replied: 'وصل رد',
    /** Above the facts strip on a row: WHY this message said what it said. */
    whyLabel: 'اتبعتت عشان',
    /** `{quiz}` and `{score}`. */
    whyQuizResult: 'امتحان «{quiz}» بدرجة {score}٪',
    whyQuizNudge: 'درس «{lesson}» من غير حل الكويز',
    whyLessonPraise: 'درس «{lesson}» اللي مالوش كويز',
    whyWhatsappInvite: 'دعوة لجروب الواتساب',
    /** `{topics}` — the weak areas the message named. */
    whyFocus: 'ركّزت على: {topics}',

    // ── the kinds ────────────────────────────────────────────────────
    kindQuizResult: 'بعد الامتحان',
    kindQuizNudge: 'كويز ما اتحلّش',
    kindLessonPraise: 'درس خلص',
    kindWhatsappInvite: 'دعوة الجروب',

    // ── the preview ──────────────────────────────────────────────────
    previewTitle: 'شكل الرسايل',
    previewLead: 'دي رسايل حقيقية من نفس المولّد اللي بيبعت للطلبة — بأسماء ودرجات متخيّلة. لاحظ إن كل واحدة مكتوبة بشكل مختلف.',
    previewSample: 'نموذج {n}',

    // ── the switches ─────────────────────────────────────────────────
    settingsTitle: 'إمتى المنصة تتكلم باسمك',
    settingsLead: 'كل نوع ليه مفتاح لوحده. لو قفلت نوع، الرسايل اللي اتبعتت قبل كده بتفضل مكانها.',
    quizResult: 'رسالة بعد كل امتحان',
    quizResultHint: 'بتقوله درجته وتسمّي الأسئلة اللي غلط فيها بالموضوع بتاعها',
    quizNudge: 'تنبيه على الكويز اللي ما اتحلّش',
    quizNudgeHint: 'لو الدرس خلص والكويز اتساب',
    lessonPraise: 'كلمة بعد الدرس',
    lessonPraiseHint: 'للدروس اللي مالهاش كويز — الرسالة الوحيدة اللي مش بتطلب حاجة',
    whatsappInvite: 'دعوة قناة الواتساب',
    whatsappInviteHint: 'بتتبعت للطلبة اللي لسه مضغطوش على اللينك — ومحتاجة لينك القناة في وسائل التواصل',
    nudgeAfterHours: 'يستنى قد إيه قبل التنبيه',
    nudgeAfterHoursHint: 'بالساعات، من ساعة ما يخلّص الدرس',
    groupInviteEveryDays: 'كل قد إيه يفكّره بالقناة',
    groupInviteEveryDaysHint: 'بالأيام — وبنعدّ كمان المرات اللي القناة اتذكرت فيها جوه رسالة تانية',
    maxInvitesPerStudent: 'أقصى عدد مرات نفكّره',
    maxInvitesPerStudentHint: 'على طول عمره في المنصة. وأول ما يضغط على اللينك بنبطّل نفكّره خالص.',
    maxPerStudentPerDay: 'أقصى عدد رسايل للطالب في اليوم',
    maxPerStudentPerDayHint: 'رسايل النتايج مستثناة — الطالب اللي امتحن تلات مرات يستاهل تلات ردود',
    /** The line under the whole switch block. */
    settingsNote: 'مفيش زرار «إرسال للكل» هنا، وده مقصود: كل رسالة سببها حاجة عملها الطالب نفسه.',
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
    clearFilters: 'مسح الفلاتر',
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
    clearSelection: 'إلغاء التحديد',
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
  grantCourse: 'فتح كورس',
  grantOpen: 'فتح',
  grantLive: 'مفتوح',
  grantRevoked: 'اتقفل',
  revokeGrant: 'اقفله',
  noClosedCourses: 'مفيش كورسات مقفولة أصلاً.',
  allClosedGranted: 'كل الكورسات المقفولة مفتوحة للطالب ده.',

  /**
   * الاشتراكات في الكورسات المدفوعة — a DIFFERENT panel from
   * `courseAccess` above, worded around it explicitly so the two are never
   * confused: that one opens a closed door with no plan, price or expiry at
   * all; this one is the paid-subscription system itself, entered from the
   * admin side. Same plans and prices the real subscribe flow offers, same
   * `AccessGrant`/`Enrollment` state a genuine approval produces.
   */
  subscriptionsTitle: 'اشتراكات الكورسات المدفوعة',
  subscriptionsLead:
    'اشترك الطالب في كورس مدفوع من هنا — بنفس الباقات والأسعار اللي شايفها في صفحة الكورس، وبيتفعّل على طول زي ما لو دفع فودافون كاش وتمت الموافقة عليه.',
  subscriptionsEmpty: 'الطالب ده مالوش أي اشتراك مدفوع لسه.',
  noPricedCourses: 'مفيش كورسات مدفوعة أصلاً.',
  subscribeButton: 'اشتراك جديد',
  subscribeDialogTitle: 'اشتراك جديد',
  subscribeCourseLabel: 'الكورس',
  subscribePlanLabel: 'الباقة',
  /** The radio option's own label — a generic "ترم" before any specific term
   *  is chosen. The picker just below it (`subscribeTermLabel`) is where the
   *  admin says WHICH one. */
  subscribePlanTermLabel: 'ترم',
  subscribeTermLabel: 'الترم',
  /** Offered even for a CLOSED term — the admin override, see
   *  `SubscribableTerm`'s own doc. */
  subscribeTermClosedBadge: 'مقفول',
  subscribeFreeLabel: 'مجاني (منحة/تعويض)',
  subscribeFreeHint: 'هيتفعّل بنفس مدة الباقة، بس مش هيتحسب ضمن الإيرادات في صفحة «الاشتراكات والإيرادات».',
  subscribePaidLabel: 'مدفوع',
  /** `{amount}` — the plan's own price, never admin-typed. */
  subscribeAmountLabel: 'المبلغ: {amount} ج',
  /** `{amount}` — same price as the label above; the checkbox that stands in
   *  for "typing" a confirmation without inventing a free-text price field. */
  subscribeConfirmPaid: 'أأكد إن مبلغ {amount} ج اتحول للكورس ده',
  subscribeScreenshotLabel: 'صورة التحويل (اختياري)',
  subscribeScreenshotHint: 'لو معاك صورة التحويل من واتساب ممكن ترفعها هنا — مش شرط.',
  /** `{date}` — the course's CURRENT expiry, shown when the selected course
   *  already has a live subscription: submitting extends it rather than
   *  replacing it, same as a real renewal. */
  subscribeAlreadyActive: 'الطالب مشترك في الكورس ده لحد {date} بالفعل — الاشتراك ده هيتضاف فوق المتبقي.',
  /** The term counterpart — no date to extend, a term grant is open-ended
   *  until an admin closes the term. */
  subscribeAlreadyActiveTerm: 'الطالب مشترك في الترم ده بالفعل.',
  subscribeSubmit: 'تسجيل الاشتراك',
  subscribeSubmitting: 'بيتسجّل…',
  subscribeUploadFailed: 'مقدرناش نرفع الصورة — نحاول تاني',
  subscribeFailed: 'مقدرناش نسجل الاشتراك — نحاول تاني',
  subscriptionLive: 'شغّال',
  subscriptionCancelled: 'اتلغى',
  subscriptionExpired: 'خلص',
  subscriptionFreeBadge: 'مجاني',
  cancelSubscription: 'إلغاء الاشتراك',
  cancelSubscriptionDialogTitle: 'إلغاء الاشتراك',
  cancelSubscriptionBody:
    'الطالب مش هيقدر يفتح الكورس ده تاني لحد ما يشترك من جديد. الفلوس اللي اتدفعت مش بترجع من هنا — ده بس بيقفل الوصول.',
  cancelSubscriptionConfirm: 'إلغاء الاشتراك',
  cancelSubscriptionFailed: 'مقدرناش نلغي الاشتراك — نحاول تاني',

    backToList: 'رجوع لقائمة الطلبة',
    profileSection: 'البيانات الشخصية',
    academicSection: 'البيانات الدراسية',
    fullName: 'الاسم بالكامل',
    schoolName: 'اسم المدرسة',
    fatherPhone: 'رقم هاتف ولي الأمر',
    motherPhone: 'رقم هاتف الأم',
    /* ── الاتصال ────────────────────────────────────────────────────────
     *
     * `wa.me`, never a `tel:` — there is no `tel:` anywhere in this product
     * and this is not the place to start one. Asked for by name: «تقولي
     * خيارين يكلمه واتساب يا أرن عليه. بس خليها واتساب أحسن».
     *
     * `whatsappParent` names WHOSE number it is. A row of three identical
     * green buttons under three different phone numbers is a way to send the
     * wrong person a message about their own child.
     */
    whatsapp: 'مراسلته على واتساب',
    whatsappFather: 'واتساب ولي الأمر',
    whatsappMother: 'واتساب الأم',
    schoolStream: 'المدرسة',
    /** The profiles that predate the question — not a guess, and not blank. */
    schoolStreamUnknown: 'مش متسجّل',
    /**
     * Shown where an email used to be unconditional. A blank cell reads as a
     * rendering bug; this says the student simply never gave one, which is now
     * a perfectly ordinary account rather than a broken one.
     */
    emailNotGiven: 'مادّاش إيميل',
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
    roleChangeFailed: 'مقدرناش نغيّر الدور — نحاول تاني',
    roleChangeSelfError: 'مينفعش تغيّر دورك إنت',
    roleChangeLastAdminError: 'ده آخر مسؤول في المنصة — مينفعش تلغي صلاحياته',
    saveSuccess: 'اتحفظت بيانات الطالب',
    saveFailed: 'مقدرناش نحفظ — نحاول تاني',
    /** A duplicate phone or email — caught by the DB's own unique index. */
    saveConflict: 'الرقم أو الإيميل ده متسجّل بحساب تاني بالفعل',

    /* ── تعيين كلمة سر جديدة ──────────────────────────────────────────────
     *
     * NEVER «عرض كلمة السر» — passwords are Argon2id hashes and there is
     * nothing to show. The copy is deliberately explicit about that, so
     * nobody reads this control as a way to recover a forgotten password
     * rather than replace it.
     */
    setPasswordTitle: 'كلمة السر',
    setPasswordLead:
      'كلمة السر متشفّرة ومفيش طريقة نشوفها. لو الطالب نسيها، تقدر تحط له واحدة جديدة من هنا.',
    setPasswordAction: 'تعيين كلمة سر جديدة',
    setPasswordDialogTitle: 'تعيين كلمة سر جديدة',
    setPasswordNewLabel: 'كلمة السر الجديدة',
    setPasswordConfirmLabel: 'تأكيد كلمة السر الجديدة',
    setPasswordConfirm: 'تعيين كلمة السر',
    setPasswordMismatch: 'كلمتا المرور مش متطابقتين',
    setPasswordSuccess: 'اتغيّرت كلمة السر',
    setPasswordFailed: 'مقدرناش نغيّر كلمة السر — نحاول تاني',

    /* ── حظر ومسح الحساب ─────────────────────────────────────────────────
     *
     * Two operations that look adjacent in the UI and are not adjacent at all
     * in consequence, which is why the copy works hard to separate them: a ban
     * is reversible and says so, a delete is not and says THAT. The confirm
     * labels are deliberately different verbs so an admin skim-reading two
     * dialogs cannot mistake one for the other.
     */
    accessTitle: 'حالة الحساب',
    accessActive: 'نشط',
    accessBanned: 'موقوف',
    /** `{date}` — when the ban was applied. */
    bannedSince: 'موقوف من {date}',
    /** `{name}` — the admin who issued it. */
    bannedBy: 'بواسطة {name}',
    bannedReasonLabel: 'سبب الإيقاف',

    ban: 'إيقاف الحساب',
    banTitle: 'إيقاف حساب الطالب',
    banBody:
      'الطالب مش هيقدر يدخل على حسابه تاني، وكل الأجهزة المفتوحة هتتقفل على طول. بياناته وتقدّمه كلهم زي ما هم، وتقدر ترجّعه في أي وقت.',
    banReason: 'سبب الإيقاف',
    banReasonPlaceholder: 'الطالب هيشوف السبب ده لما يحاول يدخل — اكتبه بوضوح',
    banConfirm: 'أوقف الحساب',
    banSuccess: 'الحساب اتوقف',
    banFailed: 'مقدرناش نوقف الحساب — نحاول تاني',
    banSelfError: 'مينفعش توقف حسابك إنت',
    banLastAdminError: 'ده آخر مسؤول نشط في المنصة — مينفعش توقفه',

    unban: 'رفع الإيقاف',
    unbanTitle: 'رفع الإيقاف عن الحساب',
    unbanBody:
      'الطالب هيقدر يدخل تاني عادي. مش هنرجّع الأجهزة اللي كانت مفتوحة — هيسجّل دخول من الأول.',
    unbanConfirm: 'رفع الإيقاف',
    unbanSuccess: 'اترفع الإيقاف',
    unbanFailed: 'مقدرناش نرفع الإيقاف — نحاول تاني',

    delete: 'مسح الحساب نهائيًا',
    deleteTitle: 'مسح الحساب نهائيًا',
    /**
     * Names what is destroyed, item by item, because "are you sure?" is not
     * information. An admin who is about to erase a year of quiz history
     * should be reading that sentence, not a generic warning.
     */
    deleteBody:
      'الحساب ده هيتمسح خالص ومش هينفع يترجع. هيتمسح معاه: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. ولو المطلوب إيقافه بس، فيه «إيقاف الحساب» — وده بيترجع.',
    /** `{email}` — the account's own address, which the admin must retype. */
    /**
     * «رقم أو إيميل» rather than naming one: the dialog prints the exact
     * string underneath, and which of the two it is depends on the account —
     * a phone for anyone who registered after the phone became the identity,
     * an email for the older accounts and for admins. Promising «الإيميل» to
     * an operator who is then shown a phone number reads as a bug.
     */
    deleteConfirmIdentityLabel: 'رقم الحساب أو إيميله للتأكيد',
    deleteConfirmIdentityHint: 'المطلوب: {identity}',
    deleteReason: 'سبب المسح',
    deleteReasonPlaceholder: 'وضّح سبب المسح — هيتسجل في سجل النشاط قبل ما الحساب يروح',
    deleteConfirm: 'مسح نهائي',
    deleteSuccess: 'الحساب اتمسح',
    deleteFailed: 'مقدرناش نمسح الحساب — نحاول تاني',
    deleteSelfError: 'مينفعش تمسح حسابك إنت',
    deleteLastAdminError: 'ده آخر مسؤول في المنصة — مينفعش تمسحه',
    deleteEmailMismatch: 'الإيميل اللي كتبته مش مطابق للحساب ده',
    /**
     * The refusal that names WHY. `{items}` is a pre-joined Arabic list built
     * by the action from the counts the API returns, e.g. «٣ كورسات و١٢ سؤال».
     * Generic «مقدرناش نمسح» would leave the admin with nothing to do next.
     */
    deleteBlocked:
      'الحساب ده مؤلف محتوى على المنصة ({items})، فمينفعش يتمسح. انقل المحتوى لحساب تاني أو امسحه الأول، أو أوقف الحساب بدل ما تمسحه.',
    deleteBlockedCourses: '{n} كورس',
    deleteBlockedQuestions: '{n} سؤال',
    deleteBlockedNews: '{n} مقال',

    /* ── مسح مجموعة من قائمة الطلبة ──────────────────────────────────────
     *
     * The bulk dialog cannot ask for an email — twenty of them is not a
     * confirmation, it is a transcription exercise. So the information about
     * WHICH accounts moves into the dialog body (every name and email, listed)
     * and the friction becomes one typed word. The word is «مسح» and not
     * «نعم» on purpose: a yes/no dialog is the one an admin dismisses on
     * autopilot.
     */
    bulkDelete: 'مسح المحدد',
    /** `{n}` — how many rows are selected. */
    bulkDeleteTitle: 'مسح {n} حساب نهائيًا',
    bulkDeleteBody:
      'الحسابات دي هتتمسح خالص ومش هينفع ترجع. هيتمسح معاها: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. ولو المطلوب إيقافهم بس، من صفحة الحساب فيه «إيقاف الحساب» — وده بيترجع.',
    bulkDeleteListLabel: 'الحسابات اللي هتتمسح',
    /** `{n}` — the accounts beyond the ones the dialog had room to list. */
    bulkDeleteListMore: 'و{n} حساب كمان',
    bulkDeleteConfirmLabel: 'كلمة «مسح» للتأكيد',
    /** The exact word the field above must contain. Compared, not displayed. */
    bulkDeleteConfirmWord: 'مسح',
    bulkDeleteReason: 'سبب المسح',
    bulkDeleteReasonPlaceholder: 'وضّح سبب المسح — هيتسجل في سجل النشاط لكل حساب',
    bulkDeleteConfirm: 'امسحهم نهائيًا',
    /** `{n}` — how many were actually deleted. */
    bulkDeleteSuccess: 'اتمسح {n} حساب',
    /** `{n}` — how many refused. Shown beside the success line, not instead. */
    bulkDeletePartial: '{n} حساب ما اتمسحوش — اتساب متحددين',
    bulkDeleteFailed: 'مقدرناش نمسح — نحاول تاني',
    bulkDeleteNoneDeleted: 'مفيش حساب اتمسح',
    /** Why one row refused, shown in the row list after a partial run. */
    bulkDeleteReasonSelf: 'حسابك إنت',
    bulkDeleteReasonLastAdmin: 'آخر مسؤول',
    bulkDeleteReasonAuthored: 'مؤلف محتوى',
    bulkDeleteReasonMissing: 'اتمسح قبل كده',
  },
  payments: {
    eyebrow: 'فودافون كاش',
    title: 'المدفوعات',
    subtitle: 'طلبات اشتراك الطلبة في الكورسات المدفوعة، بانتظار المراجعة.',
    filterPending: 'قيد المراجعة',
    filterApproved: 'اتوافق عليها',
    filterRejected: 'اترفضت',
    filterAll: 'الكل',
    empty: 'مفيش طلبات دلوقتي',
    emptyHint: 'أول ما طالب يبعت طلب اشتراك، هيظهر هنا.',
    columnStudent: 'الطالب',
    columnCourse: 'الكورس',
    columnPlan: 'الباقة',
    columnAmount: 'المبلغ',
    /** Label ahead of the number the transfer was sent FROM — see the model
     *  note on `PaymentSubmission.senderPhone`. Distinct from the student's
     *  own account phone, shown unlabelled beside it, because they are
     *  often different numbers (a parent's line, for example). */
    senderPhoneLabel: 'حوّل من',
    columnStatus: 'الحالة',
    columnDate: 'التاريخ',
    planMonthly: 'شهر',
    planQuarterly: '٣ شهور',
    /** A full-year subscription — same date-based treatment as the two
     *  above, just twelve months instead of one or three. */
    planYearly: 'سنة',
    /** `{term}` — the term's own title («الترم الأول»). See `Course
     *  Term`'s model doc: an independent plan, not a replacement for the
     *  others. */
    planTerm: 'ترم — {term}',
    /** `{n}` — how many approved submissions this student had before this one. */
    approvedBefore: 'دفع قبل كده {n} مرة',
    approvedBeforeNone: 'أول اشتراك ليه',
    /** `alt` on the thumbnail AND `aria-label` on the lightbox overlay —
     *  `{student}` names whose screenshot this is. */
    screenshotAlt: 'صورة تحويل {student}',
    whatsapp: 'واتساب',
    approve: 'موافقة',
    approving: 'بتوافق…',
    reject: 'رفض',
    rejectPromptTitle: 'سبب الرفض',
    rejectReasonLabel: 'السبب — هيتبعت للطالب زي ما هو',
    rejectReasonPlaceholder: 'مثلاً: المبلغ في الصورة مش مطابق للباقة',
    rejectConfirm: 'تأكيد الرفض',
    rejectCancel: 'إلغاء',
    rejecting: 'بترفض…',
    actionFailed: 'حصل خطأ، حاول تاني',
    alreadyReviewed: 'الطلب ده اتراجع قبل كده',
    /** `{n}` — the sidebar badge's `sr-only` announcement on `/admin/payments`,
     *  the same slot `assistant.inbox.badgeLabel` fills on `/admin/inbox`. */
    pendingBadgeLabel: '{n} طلب قيد المراجعة',
    /** A row `PaymentsService.adminManualSubscribe` created directly — no
     *  Vodafone Cash number to reconcile, so this fills `senderPhoneLabel`'s
     *  usual slot instead of a blank. */
    recordedManually: 'اشتراك مسجّل يدويًا',
    /** An admin-comped term — never counted as revenue. See the model note
     *  on `PaymentSubmission.isFree`. */
    freeBadge: 'مجاني',
  },
  finance: {
    eyebrow: 'الحسابات',
    title: 'الاشتراكات والإيرادات',
    subtitle: 'مين دفع، قد إيه، واشتراكه هيخلص إمتى.',
    /* ── the three tabs ─────────────────────────────────────────────────── */
    tabOverview: 'النظرة العامة',
    tabSubscriptions: 'المشتركين',
    tabExpenses: 'المصروفات',
    /* ── «النظرة العامة» ────────────────────────────────────────────────── */
    overviewTitle: 'النظرة العامة',
    overviewSubtitle: 'دخل كام، صرف كام، وفضل كام.',
    tileRevenueTotal: 'إجمالي الإيرادات',
    tileSubscriptionRevenue: 'إيراد الاشتراكات',
    tileExpensesTotal: 'إجمالي المصروفات',
    /** May be negative, and the tile says so rather than clamping at zero. */
    tileNet: 'صافي الربح',
    tileBookProfit: 'مكسب الكتب',
    /** The heading over the per-category breakdown. */
    expensesByCategory: 'المصروفات راحت فين',
    /** Shown under «مكسب الكتب» when some sold titles have no unit cost — the
     *  margin is understated by exactly those, and saying so is the difference
     *  between a figure and a guess. */
    bookCostUnknown: '{n} سطر مالوش تكلفة نسخة — المكسب محسوب من غيرهم',
    /** The way OUT of the sentence above — it named a problem and pointed at
     *  nothing, so the fix («تكلفة النسخة» on the book) was a screen nobody
     *  knew to look for. */
    bookCostFix: 'حدّد تكلفة النسخة',
    monthlyTitle: 'شهر بشهر',
    monthColumn: 'الشهر',
    monthSubscriptions: 'اشتراكات',
    monthBooks: 'كتب',
    monthExpenses: 'مصروفات',
    monthNet: 'الصافي',
    monthlyEmpty: 'لسه مفيش حركة',
    /** Summary tiles. */
    tileRevenue: 'إجمالي الإيرادات',
    tileActive: 'اشتراكات فعالة',
    tileExpiringSoon: 'هتخلص خلال أسبوع',
    filterAll: 'الكل',
    filterActive: 'فعّال',
    filterExpiringSoon: 'هيخلص قريب',
    filterExpired: 'خلص',
    empty: 'مفيش اشتراكات مدفوعة لسه',
    emptyHint: 'أول ما طلب اشتراك يتوافق عليه، هيظهر هنا.',
    columnStudent: 'الطالب',
    columnCourse: 'الكورس',
    columnPlan: 'الباقة',
    columnAmount: 'آخر دفعة',
    columnPaidAt: 'اتدفعت في',
    columnValidUntil: 'هتخلص في',
    columnStatus: 'الحالة',
    statusActive: 'فعّال',
    statusExpiringSoon: 'هيخلص قريب',
    statusExpired: 'خلص',
    /** No `PaymentSubmission` behind the grant — should not occur for a
     *  `purchase` grant, but the join can come back empty. */
    noPayment: '—',
    /** An admin-comped term, shown in the amount column instead of a price —
     *  see the model note on `PaymentSubmission.isFree`. Never summed into
     *  `tileRevenue`. */
    freeBadge: 'مجاني',
    /** Shown in the «هتخلص في» column for a `scope: term` row instead of a
     *  date — it never expires by date, only by an admin closing the term.
     *  See `AccessGrant.validUntil`'s own note. */
    noExpiryTermOpen: 'طول ما الترم مفتوح',
    /** Shown for a `scope: course` row an admin reopened open-ended via
     *  «تعديل تواريخ الاشتراك» (`validUntil: null`) — see `editDates`'s own
     *  doc on why that is a valid, supported state for this exact column,
     *  distinct from `noExpiryTermOpen`'s term-specific wording. */
    noExpiryReopened: 'مفتوح — من غير تاريخ انتهاء',
    /** `{term}` — appended under the course title for a term-scoped row, so
     *  it reads distinctly from a whole-course subscription rather than as
     *  an unlabelled one with a missing date. */
    termLabel: 'اشتراك ترم: {term}',

    /** Filter chips. `{n}` — the count badge beside every option, from
     *  `summary.filterCounts`, so an admin can see the size of a bucket
     *  before clicking into it. */
    filterCount: '{label} ({n})',
    filterPlanAll: 'كل الباقات',
    filterPlanMonthly: 'شهري',
    filterPlanQuarterly: '٣ شهور',
    filterPlanYearly: 'سنوي',
    filterPlanTerm: 'ترم',
    /** An admin-comped subscription — orthogonal to the four plans above, so
     *  it sits in its own filter group rather than as a fifth plan value. */
    filterPlanFree: 'مجاني',
    filterYearAll: 'كل السنين',
    /** `{year}` — `Course.year`, shown as a plain number, same as every
     *  other admin screen's forced-Latin-numeral convention. */
    filterYearLabel: 'سنة {year}',
    filterStreamAll: 'كل المدارس',
    sortNewestFirst: 'الأحدث أولاً',
    sortOldestFirst: 'الأقدم أولاً',

    columnRenewals: 'التجديدات',
    /** A subscription paid exactly once — never renewed. */
    renewalCountNone: '—',
    /** `{n}` — how many times this student renewed THIS subscription (one
     *  less than how many times he paid for it in total). */
    renewalCountBadge: 'اتجدد {n} مرة',

    columnActions: 'إجراءات',
    actionEdit: 'تعديل',
    actionCancel: 'إلغاء',

    editDialogTitle: 'تعديل الاشتراك',
    editAmountSection: 'المبلغ المحصّل',
    editAmountLabel: 'المبلغ (جنيه)',
    /** «مجاني» — the same admin-comped meaning as `PaymentSubmission.isFree`
     *  everywhere else on this screen: nothing was actually collected. */
    editIsFreeLabel: 'مجاني — متحصلش فلوس',
    editAmountSave: 'حفظ المبلغ',
    editAmountSaving: 'بيتحفظ…',
    editDatesSection: 'تواريخ الاشتراك',
    /** Shown INSTEAD of the dates form for a `scope: 'term'` row — see
     *  `AdminFinanceEditDatesSchema`'s own note on why it has no calendar
     *  `validUntil` to override. */
    editDatesTermNotice: 'اشتراك الترم مالوش تاريخ انتهاء يتغير — بيتقفل لما الترم يتقفل بس.',
    editValidFromLabel: 'يبدأ في',
    editValidUntilLabel: 'ينتهي في',
    editValidUntilOpenEnded: 'من غير تاريخ انتهاء',
    editDatesSave: 'حفظ التواريخ',
    editDatesSaving: 'بيتحفظ…',
    editClose: 'قفل',
    editFailed: 'مقدرناش نحفظ — حاول تاني',

    cancelDialogTitle: 'إلغاء الاشتراك بدري',
    cancelReasonLabel: 'السبب',
    cancelReasonPlaceholder: 'مثلاً: الطالب طلب إلغاء الاشتراك',
    /** «يبقى اختياري يشوفه» — off by default; writing a reason never makes
     *  it student-visible on its own. */
    cancelShowToStudentLabel: 'يظهر السبب ده للطالب في إشعاراته',
    cancelConfirm: 'تأكيد الإلغاء',
    cancelBack: 'رجوع',
    cancelCancelling: 'بيتلغي…',
    cancelFailed: 'مقدرناش نلغي — حاول تاني',
    /** Shown once a reason exists on an already-cancelled row — admin-eyes
     *  view of what was recorded, regardless of `cancelReasonVisibleToStudent`. */
    cancelReasonRecorded: 'سبب الإلغاء: {reason}',

    /** الكتاب الورقي's own revenue tile, composed alongside — never merged
     *  into — the subscription numbers above. See `BookOrdersService
     *  .adminRevenueSummary`'s own note on why this is a separate fetch. */
    bookRevenueSectionTitle: 'الكتاب الورقي — منفصل عن الاشتراكات',
    tileBookRevenue: 'إجمالي إيرادات الكتب',
    tileBookPaidCount: 'كتب مدفوعة',
  },

  /** المصروفات — `/admin/finance/expenses`. */
  expenses: {
    eyebrow: 'الحسابات',
    title: 'المصروفات',
    subtitle: 'كل حاجة اتدفعت — تصوير، مطبعة، أدوات، وأي حاجة تانية.',
    add: 'أضف مصروف',
    edit: 'تعديل',
    remove: 'حذف',
    removeConfirm: 'تمسح المصروف ده؟ مش هيرجع تاني.',
    empty: 'مفيش مصروفات مسجّلة',
    emptyHint: 'أول ما تسجّل حاجة اتدفعت، هتظهر هنا وتتحسب في الصافي.',
    columnDate: 'التاريخ',
    columnCategory: 'النوع',
    columnTitle: 'الوصف',
    columnBook: 'الكتاب',
    columnAmount: 'المبلغ',
    /* ── the form ───────────────────────────────────────────────────────── */
    formTitle: 'مصروف جديد',
    formTitleEdit: 'تعديل المصروف',
    fieldDate: 'اتدفع في',
    /** The month the money LEFT, not the day it was typed in — see the column
     *  note in schema.prisma. Said out loud because entering last month's
     *  invoice today is the case that gets it wrong. */
    fieldDateHint: 'الشهر اللي الفلوس خرجت فيه، مش النهاردة.',
    fieldCategory: 'النوع',
    fieldAmount: 'المبلغ بالجنيه',
    fieldTitle: 'الوصف',
    fieldTitlePlaceholder: 'يوم تصوير استوديو',
    fieldNote: 'ملاحظات (اختياري)',
    fieldBook: 'الكتاب (اختياري)',
    fieldBookNone: 'مش مربوط بكتاب',
    fieldBookHint: 'لو ده طبعة كتاب، اختاره واكتب اشتريت كام نسخة.',
    fieldQuantity: 'عدد النسخ',
    filterMonth: 'الشهر',
    filterMonthAll: 'كل الشهور',
    filterCategoryAll: 'كل الأنواع',
    saveFailed: 'المصروف ماتسجّلش',
    removeFailed: 'الحذف مانفعش',
  },

  /** What a spend was for. One table, read by the form's select, the list's
   *  cells and the overview's breakdown — three copies would drift. */
  expenseCategory: {
    filming: 'تصوير',
    printing: 'مطبعة',
    equipment: 'أدوات ومعدات',
    marketing: 'إعلانات',
    staff: 'أجور',
    services: 'خدمات واشتراكات',
    other: 'حاجات تانية',
  },
  /**
   * الكتاب الورقي — `/admin/books`. `filterAddressOnly` and `filterPaid` are
   * the two "real" lists Ayman asked for by name, kept on separate tabs
   * rather than merged — see the `BookOrder` model doc for why an
   * address-only row is never deleted.
   */
  books: {
    eyebrow: 'الكتاب الورقي',
    title: 'طلبات الكتب',
    subtitle: 'طلبات الطلبة لاستلام كتاب الكورس في البيت.',
    filterPaid: 'مدفوعة',
    filterAddressOnly: 'بدأت ومكملتش',
    filterShipped: 'اتشحنت',
    filterAll: 'الكل',
    empty: 'مفيش طلبات دلوقتي',
    emptyHint: 'أول ما طالب يطلب كتاب، هيظهر هنا.',
    columnBook: 'الكتاب',
    columnCourse: 'الكورس',
    columnStudent: 'الطالب',
    columnAddress: 'العنوان',
    columnAmount: 'السعر',
    columnStatus: 'الحالة',
    columnDate: 'التاريخ',
    statusAddressOnly: 'بدأ ومكملش الدفع',
    statusPaid: 'مدفوعة، لسه ماتشحنتش',
    statusShipped: 'اتشحنت',
    /** Shown beside the name on a GUEST order — no account is linked, so
     *  there is nowhere for the name to link to. See `AdminBookOrderRow`'s
     *  own note on why `userId`/`studentName` are nullable now. */
    guestLabel: 'زائر (بدون حساب)',
    /** `{name}` — the addressee's own full name, distinct from the account
     *  holder's name shown elsewhere (often a parent's account). `{city}` —
     *  plain text, not a taxonomy value, distinct from `{governorate}`. */
    addressLine: '{name} — {governorate}، {city}، {street}',
    /** Appended only when the order has a building number — see the
     *  `BookOrder.addressBuilding` model doc for why it's optional. */
    addressLineBuilding: '، عمارة {building}',
    altPhoneLabel: 'موبايل تاني',
    senderPhoneLabel: 'حوّل من',
    screenshotAlt: 'صورة تحويل {student}',
    whatsapp: 'واتساب',
    ship: 'اتشحن',
    shipping: 'بتسجّل…',
    shipConfirm: 'نسجّل إن الطلب ده اتشحن؟',
    actionFailed: 'حصل خطأ، حاول تاني',
    alreadyShipped: 'الطلب ده اتشحن قبل كده',
    /** The `sr-only` sentence beside the sidebar's «الكتب» badge. `{n}` is the
     *  number of paid orders that have not shipped yet. */
    unshippedBadgeLabel: '{n} طلب كتاب متشحنش لسه',
    exportHint: 'بيصدّر كل الطلبات في التبويب المفتوح دلوقتي — جاهز يتبعت لشركة الشحن والمطبعة.',
    /** `{tab}` — the currently open tab's own label, so the button names
     *  exactly what it will export rather than a hidden default. */
    exportButton: 'تصدير: {tab}',
    /*
     * ════════════════════════════════════════════════════════════════════
     * «أضف طلب كتاب» — an admin entering a customer's order directly,
     * skipping the public/guest two-step flow. Same address-form fields as
     * `student.bookOrder.*` (aliased below, same principle as
     * `common.saveFailed` above — one wording for one field, admin or
     * student), plus the one control that flow doesn't have: marking paid
     * or address-only right away. See `AdminCreateBookOrderSchema`'s own doc.
     * ════════════════════════════════════════════════════════════════════
     */
    createButton: 'أضف طلب كتاب',
    createDialogTitle: 'طلب كتاب جديد',
    createCourseLabel: 'الكورس',
    /** Shown instead of the dialog trigger when no course has both
     *  `bookTitle`/`bookPriceCents` set — nothing to pick from. */
    createNoCourses: 'مفيش كورسات ليها كتاب مسعّر دلوقتي',
    createFullNameLabel: student.bookOrder.fullNameLabel,
    createPhoneLabel: student.bookOrder.phoneLabel,
    createAltPhoneLabel: student.bookOrder.altPhoneLabel,
    createGovernorateLabel: student.bookOrder.governorateLabel,
    createGovernoratePlaceholder: student.bookOrder.governoratePlaceholder,
    createCityLabel: student.bookOrder.cityLabel,
    createAddressStreetLabel: student.bookOrder.addressStreetLabel,
    createAddressBuildingLabel: student.bookOrder.addressBuildingLabel,
    createAddressNoteLabel: student.bookOrder.addressNoteLabel,
    /** `{amount}` — the book's own price, read-only once a course is picked;
     *  never admin-typed, same rule the public flow follows. */
    createAmountLabel: 'سعر الكتاب: {amount} ج',
    createPaidLabel: 'مدفوع بالفعل',
    createPaidHint: 'العميل حوّل بالفعل — الطلب هيتسجل «مدفوعة» على طول، من غير الخطوتين.',
    createAddressOnlyLabel: 'لسه مادفعش',
    /** OPTIONAL, unlike the public payment step's own required field — an
     *  admin recording a transfer after the fact may not have asked for it. */
    createSenderPhoneLabel: 'حوّل من (اختياري)',
    createScreenshotLabel: 'صورة التحويل (اختياري)',
    createScreenshotHint: 'لو معاك صورة التحويل ممكن ترفعها هنا — مش شرط.',
    createSubmit: 'حفظ الطلب',
    createSubmitting: 'بيتسجّل…',
    createFailed: 'مقدرناش نسجل الطلب — نحاول تاني',
    createUploadFailed: 'مقدرناش نرفع الصورة — نحاول تاني',

    /*
     * ════════════════════════════════════════════════════════════════════
     * The two tabs. `/admin/books` is the shipping queue it has always been;
     * `/admin/books/catalog` is the SHELF — what is on sale. Two screens and
     * not two halves of one, because they are opened for different reasons:
     * the queue daily, the catalogue when a title or a price changes.
     * ════════════════════════════════════════════════════════════════════
     */
    tabOrders: 'الطلبات',
    tabCatalog: 'الكتب',

    /** The order's own lines. `{n}` books, `{copies}` copies in total — the
     *  two differ the moment somebody orders two of anything, and «كل واحد
     *  عايز كام كتاب» is the second number. */
    itemsSummary: '{n} كتاب — {copies} نسخة',
    /** One line: «كتاب الترم الأول ×٢ — ٥٠٠ ج». */
    itemLine: '{title} ×{quantity} — {amount} ج',
    /** The money breakdown on a row. Shown apart from the total because the
     *  delivery fee is the number people call to ask about. */
    breakdown: 'الكتب {items} ج · الشحن {shipping} ج · الإجمالي {total} ج',
    breakdownWithDiscount:
      'الكتب {items} ج · الشحن {shipping} ج · خصم {discount} ج · الإجمالي {total} ج',
    adminNoteLabel: 'ملاحظة داخلية',
    /** Under the note field. The one thing that must be unambiguous about it. */
    adminNoteHint: 'الطالب مش بيشوف الملاحظة دي.',

    /*
     * ════════════════════════════════════════════════════════════════════
     * «أعدل الطلب» — the basket, the delivery fee, the discount, the address
     * and the note, in one form. See `AdminBookOrderPatchSchema`.
     * ════════════════════════════════════════════════════════════════════
     */
    editButton: 'تعديل',
    editDialogTitle: 'تعديل الطلب',
    editItemsLabel: 'الكتب',
    editAddItem: 'ضيف كتاب',
    editAddCustom: 'ضيف سطر من غير كتالوج',
    editRemoveItem: 'شيل السطر',
    editItemTitleLabel: 'اسم الكتاب',
    editItemPriceLabel: 'سعر النسخة (ج)',
    editItemQuantityLabel: 'العدد',
    editShippingLabel: 'الشحن (ج)',
    /** Says the rule the column encodes, at the field that sets it. */
    editShippingHint: 'مرة واحدة على الطلب كله. اكتب صفر لو الشحن مجاني.',
    editDiscountLabel: 'خصم (ج)',
    editTotalLabel: 'الإجمالي',
    editSubmit: 'احفظ التعديل',
    editSubmitting: 'بيتحفظ…',
    editFailed: 'مقدرناش نحفظ التعديل — نحاول تاني',
    editNoItems: 'لازم يفضل كتاب واحد على الأقل في الطلب',
    /** In the «ضيف كتاب» picker, above the catalogue list. */
    editPickBook: 'اختار من الكتب',
    editCustomTitle: 'سطر جديد',

    /*
     * ════════════════════════════════════════════════════════════════════
     * «قسم الكتب» — the catalogue itself.
     * ════════════════════════════════════════════════════════════════════
     */
    catalogTitle: 'الكتب',
    catalogSubtitle: 'اللي معروض في قسم الكتب — الأسعار والأغلفة والمخزون.',
    catalogEmpty: 'مفيش كتب في الكتالوج',
    catalogEmptyHint: 'ضيف أول كتاب، وهيظهر على طول في /books.',
    catalogNew: 'كتاب جديد',
    catalogEditTitle: 'تعديل الكتاب',
    catalogNewTitle: 'كتاب جديد',
    catalogColumnTitle: 'الكتاب',
    catalogColumnSubject: 'المادة',
    catalogColumnTerm: 'الترم',
    catalogColumnPrice: 'السعر',
    catalogColumnStock: 'المخزون',
    catalogColumnOrdered: 'اتطلب',
    /** `{n}` copies ordered, all-time. The column that makes the list worth
     *  sorting by something other than the title. */
    catalogOrderedCount: '{n} نسخة',
    /** `stock: null` — «مش بنعد», which is not the same as zero. */
    catalogStockUncounted: 'مش بنعد',
    catalogStockOut: 'خلص',
    catalogActive: 'معروض',
    catalogHidden: 'مخفي',

    fieldSlug: 'الرابط',
    fieldSlugHint: 'بيظهر في /books. من غير مسافات ولا نقط ولا شرطة مائلة.',
    fieldTitle: 'اسم الكتاب',
    fieldSubtitle: 'سطر تحت الاسم (اختياري)',
    fieldSubject: 'المادة',
    fieldSubjectNone: 'من غير مادة — يتحط في «كتب عامة»',
    fieldYear: 'الصف',
    fieldYearNone: 'من غير صف',
    fieldTerm: 'الترم',
    fieldCourse: 'الكورس المرتبط (اختياري)',
    fieldCourseNone: 'من غير كورس',
    fieldCourseHint: 'لو الكتاب ده هو كتاب كورس، اربطه بيه — الكورس الواحد ليه كتاب واحد بس.',
    fieldPrice: 'السعر (ج)',
    fieldComparePrice: 'السعر قبل الخصم (ج، اختياري)',
    fieldComparePriceHint: 'لازم يكون أعلى من السعر الحالي، وإلا الخصم يبقى كذب.',
    fieldUnitCost: 'تكلفة النسخة (ج، اختياري)',
    /** Said plainly because the alternative reading — "what I charge" — is the
     *  field right above it, and a cost typed into a price is a margin that
     *  reports itself as zero. */
    fieldUnitCostHint: 'النسخة الواحدة بتكلّفك كام. منها بيتحسب «مكسب الكتب» في الحسابات — سيبها فاضية لو مش عارف.',
    fieldCover: 'الغلاف',
    fieldDescription: 'وصف (اختياري)',
    fieldPageCount: 'عدد الصفحات (اختياري)',
    fieldStock: 'المخزون (اختياري)',
    fieldStockHint: 'سيبه فاضي لو مش بتعد. صفر معناه خلص، والكتاب يفضل ظاهر ومش قابل للطلب.',
    fieldSortOrder: 'الترتيب',
    fieldActive: 'معروض في قسم الكتب',

    termFirst: 'الترم الأول',
    termSecond: 'الترم التاني',
    termFull: 'السنة كاملة',

    catalogSave: 'احفظ',
    catalogSaving: 'بيتحفظ…',
    catalogSaveFailed: 'مقدرناش نحفظ الكتاب — نحاول تاني',
    catalogDelete: 'امسح',
    catalogDeleteConfirm: 'نمسح الكتاب ده؟ الطلبات اللي اشترته هتفضل زي ما هي.',
    catalogDeleteFailed: 'مقدرناش نمسح الكتاب — نحاول تاني',
    catalogHide: 'اخفيه',
    catalogShow: 'اعرضه',

    /** The delivery fee, edited on the catalogue screen because that is where
     *  prices live. One number for the whole shop. */
    shippingSettingTitle: 'سعر الشحن',
    shippingSettingHint: 'بينضاف مرة واحدة على كل طلب، مهما كان عدد الكتب.',
    shippingSettingLabel: 'الشحن (ج)',
    shippingSettingSave: 'احفظ',
    shippingSettingFailed: 'مقدرناش نحفظ سعر الشحن — نحاول تاني',
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
    deleteConfirm: 'نحذف المادة دي؟',
    subjectInUse: 'المادة مرتبطة بمقرر دراسي — المقرر يتحذف الأول',
    saveSuccess: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ — نحاول تاني',
    academicYearsTitle: 'الصفوف الدراسية',
  },
  media: {
    title: 'مكتبة الوسائط',
    lead: 'الصور بتتحول لـ WebP تلقائيًا وبتتحفظ باسم عشوائي — الاسم الأصلي والبيانات المخفية بتتشال.',
    upload: 'رفع صورة',
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
      'نوع الملف ده مش مدعوم. المدعوم PNG أو JPG أو WEBP. صور الآيفون (HEIC) لازم تتحوّل الأول.',
    uploadUnreadable: 'مقدرناش نقرا الملف ده كصورة. يمكن يكون مش صورة سليمة.',
    /**
     * A dropped connection, NOT a refusal — so the wording sends the
     * instructor back to the same file rather than to a different one. The
     * upload now goes browser→API directly, which makes this a state a phone
     * on a weak signal will genuinely reach.
     */
    uploadNetwork: 'النت قطع في نص الرفع. نجرّب تاني بنفس الصورة.',
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
    cropFailed: 'مقدرناش نفتح الصورة عشان نقصّها. تنفع ترفع زي ما هي.',
    dropHint: 'سحب صورة هنا، أو دوسة لاختيار ملف',
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
    chooseImage: 'اختيار صورة',
    replaceImage: 'تغيير الصورة',
    removeImage: 'شيل الصورة',

    // ── Permanent delete ──────────────────────────────────────────────
    /**
     * «مسح خالص» — deliberately NOT «حذف».
     *
     * The library already has «أرشفة» beside this button, and an admin
     * skimming two destructive-looking words has to be able to tell which one
     * they can undo. «خالص» is doing the load-bearing work in that pair.
     */
    deleteForever: 'مسح خالص',
    deleteTitle: 'تمسح الصورة خالص؟',
    /**
     * Says what goes and where from, because the difference from archiving is
     * the entire decision being made. «مش هتترجع» is the sentence the whole
     * dialog exists to deliver.
     */
    deleteWarning:
      'الصورة هتتشال من الداتا بيز ومن السيرفر نهائيًا، ومش هتترجع تاني. ولو المطلوب تخبيتها بس من غير مسح، فيه «أرشفة».',
    /**
     * Shown ONLY when the usage check came back non-empty. A second, louder
     * paragraph rather than different wording in the first: an unused image
     * and an image the site is currently rendering are different risks, and
     * flattening them into one sentence would make the warning noise that gets
     * clicked through.
     */
    deleteInUse: 'دي مستخدمة دلوقتي في:',
    deleteInUseTail: 'لو مسحتها، الأماكن دي هتفضل من غير صورة.',
    deleteChecking: 'بنشوف الصورة دي مستخدمة فين…',
    deleteConfirm: 'أيوه، امسحها خالص',
    deleted: 'اتمسحت خالص',
    deleteFailed: 'مقدرناش نمسح الصورة — نحاول تاني',
    /**
     * `MEDIA_USAGE_KINDS` -> Arabic. The API returns kinds, never sentences
     * (Global Constraint 4), and these are the labels the delete dialog lists.
     */
    usageBrandingLogoLight: 'شعار الموقع (الوضع الفاتح)',
    usageBrandingLogoDark: 'شعار الموقع (الوضع الغامق)',
    usageBrandingFavicon: 'أيقونة الموقع',
    usageSeoOgImage: 'صورة المشاركة',
    usageHomeBlock: 'الصفحة الرئيسية',

    // ── Re-crop an asset already in the library ───────────────────────
    /**
     * «عدّل القص» rather than «اقصّ»: the picture has already been cropped
     * once, when it was uploaded, and this reopens that decision.
     */
    recrop: 'تعديل القص',
    recropTitle: 'تعديل قص الصورة',
    /**
     * The bytes change, every reference to the asset does not — which is the
     * fact that decides whether an instructor uses this or uploads a second
     * copy. Worth one sentence.
     */
    recropHint: 'التعديل هيتطبّق في كل مكان الصورة دي مستخدمة فيه.',
    recropLoading: 'بنجيب الصورة الأصلية…',
    recropSuccess: 'اتعدّلت الصورة',
    recropFailed: 'مقدرناش نجيب الصورة عشان نعدّلها — نحاول تاني',
    /**
     * The frame the crop offers, per slot. A favicon is square everywhere a
     * browser paints one, a share card is 1.91:1 by Facebook's spec, and a
     * logo has no one shape — so it gets the free-form option.
     */
    aspectSquare: 'مربّع',
    aspectWide: 'عريض (صورة المشاركة)',
    aspectFree: 'زي ما هي',
  },
  flags: {
    title: 'خصائص التشغيل',
    lead: 'تشغيل أو إيقاف خصائص المنصة من غير أي نشر جديد للكود.',
    toggleSuccess: 'اتحفظت الخاصية',
    toggleFailed: 'مقدرناش نغيّر الخاصية — نحاول تاني',
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
    archiveConfirm: 'نأرشف العنصر ده؟',
    archived: 'اتأرشف العنصر',
    archiveUndo: 'تراجع',
    restored: 'اترجع العنصر',
    saveFailed: 'مقدرناش نحفظ — نحاول تاني',
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
      'الزوار بيشوفوا الصفحة كاملة عادي. دوسة هنا بتحوّل أقسامها لصفوف بتتربّت وبتتعدّل نصوصها وبيتخبّى منها اللي ملوش لزوم.',
    emptyCta: 'نبدأ من الصفحة الحالية',
    seeding: 'جارٍ التجهيز…',
    seeded: 'الأقسام اتجهّزت',
    published: 'منشور',
    unpublished: 'مسودة',
    publish: 'انشر',
    unpublish: 'إلغاء النشر',
    archiveConfirm: 'نأرشف القسم ده؟',
    archived: 'اتأرشف القسم',
    restored: 'اترجع القسم',
    saveSuccess: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ — نحاول تاني',
    blockTypeHero: 'قسم البداية',
    blockTypeWhyRail: 'ليه تتعلم هنا',
    blockTypeCourseGrid: 'شبكة كورسات',
    blockTypeBooks: 'قسم الكتب',
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
    removeItem: 'حذف',
    /** «قسم الكتب» — how many covers the strip runs before the CTA. */
    bookLimit: 'عدد الكتب',
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
    rotatingHint: 'السطر التاني في العنوان بيلف على دول. وتفضل فاضية لو المطلوب عنوان ثابت.',
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
    verifyHint: 'السجل كبير — دوسة على الزرار بتتحقق من السلسلة',
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
  /**
   * `/admin/errors` — «إيه اللي بايظ، وإيه سببه».
   *
   * The screen that did not exist. Before it, a failure a student saw left one
   * of two traces: a line in a container log nobody reads until something is
   * already known to be wrong, or — for an error thrown while React was
   * rendering in the browser — nothing at all. The instructor found out when a
   * student told him, days later, without a route or a device or a count.
   *
   * So the wording is aimed at triage and not at reassurance: what broke, where,
   * how many students, how recently, and is it still happening.
   */
  errors: {
    eyebrow: 'المراقبة',
    title: 'الأعطال',
    subtitle: 'كل مشكلة ظهرت لطالب — إيه هي، في أنهي صفحة، وحصلت كام مرة.',
    filterOpen: 'المفتوحة',
    filterResolved: 'المتقفلة',
    filterAll: 'الكل',
    /** The two numbers the page leads with. */
    statOpen: 'مشاكل مفتوحة',
    // Distinct faults seen in the window, not occurrences of them — see the
    // `count` in `DiagnosticsService.list` for why the sum it replaced could
    // not mean what this label used to say.
    statLast24h: 'عطل ظهر في آخر ٢٤ ساعة',
    empty: 'مفيش أي عطل',
    emptyHint: 'مفيش مشكلة اتسجّلت لحد دلوقتي. الصفحة دي بتتملى لوحدها أول ما حاجة تقع عند أي حد.',
    emptyResolved: 'مفيش حاجة متقفلة',
    /** Row furniture. */
    occurrences: 'مرة',
    firstSeen: 'أول مرة',
    lastSeen: 'آخر مرة',
    route: 'الصفحة',
    digest: 'كود العطل',
    device: 'الجهاز',
    student: 'الطالب',
    signedOut: 'زائر مش مسجّل',
    resolve: 'اعتبرها اتحلّت',
    reopen: 'رجّعها مفتوحة',
    resolvedAt: 'اتقفلت',
    /**
     * What each kind MEANS, in the instructor's terms rather than the
     * framework's. «server» and «client» are not words he has to learn: what
     * matters is whether the fix is on the server or in the page, and whether
     * it was simply too slow.
     */
    kindServer: 'عطل في السيرفر',
    kindClient: 'عطل في الصفحة نفسها',
    kindTimeout: 'السيرفر اتأخر ومردّش',
    /** Shown under a timeout row — the one kind with a known cause. */
    kindTimeoutHint: 'الطلب عدّى ١٥ ثانية من غير رد، فالصفحة بطّلت استنيان. غالبًا الـ API كان واقع أو بطيء وقتها.',
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
  empty: 'مفيش مقالات لسه. نبدأ بواحدة.',
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
  save: 'حفظ',
  saving: 'بيحفظ…',
  saved: 'اتحفظ',
  publish: 'انشر المقالة',
  unpublish: 'شيلها من النشر',
  publishing: 'بينفّذ…',
  delete: 'حذف',
  deleteConfirm: 'تحذف المقالة دي نهائي؟ مفيش رجوع.',
  // ── errors ────────────────────────────────────────────────────────────
  failed: 'مقدرناش نحفظ. نحاول تاني.',
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
  newQuestionHere: 'سؤال جديد',
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
    ordering: 'ترتيب',
    essay: 'سؤال مقالي',
  },
  /** Above the rows on an ordering question. The single fact an instructor has
   *  to know before typing: there is nothing to tick here, the order they type
   *  IS the key, and the student is served the same items shuffled. */
  orderingHint: 'العناصر بالترتيب الصحيح — ده هو المفتاح. الطالب بيشوفها متبعثرة ويرتبها.',
  options: 'الاختيارات',
  addOption: 'أضف اختيار',
  removeOption: 'حذف الاختيار',
  markCorrect: 'الإجابة الصحيحة',
  optionFeedback: 'تعليق على الاختيار',
  fraction: 'وزن الاختيار',
  answerPattern: 'نموذج الإجابة',
  addPattern: 'أضف نموذج إجابة',
  caseSensitive: 'يفرّق بين الحروف الكبيرة والصغيرة',
  wildcardHint: 'علامة * بتنوب عن أي جزء من الإجابة',
  defaultMark: 'درجة السؤال',
  minWords: 'أقل عدد كلمات',
  maxWords: 'أكبر عدد كلمات',
  save: 'حفظ',
  publish: 'انشر السؤال',
  published: 'السؤال اتنشر — أي تعديل بعد كده هيعمل نسخة جديدة',
  versionBadge: 'نسخة {n}',
  draftBadge: 'مسودة',
  bulkImport: 'استيراد سريع',
  bulkImportHint: 'الصق الأسئلة، كل سؤال في فقرة، وحدد الإجابة بسطر ANSWER أو الإجابة',
  bulkImportExample:
    'سؤال ١: عاصمة مصر إيه؟\nA. القاهرة\nB. الإسكندرية\nC. أسوان\nANSWER: A\n\n' +
    'سؤال ٢: النيل بيجري من الجنوب للشمال\nTYPE: true\nA. صح\nB. خطأ\nANSWER: A\n\n' +
    // The ordering block has no ANSWER line on purpose — the items ARE the
    // answer, in the order they are written. Shown here because that is the
    // one thing about this type nobody guesses.
    'سؤال ٣: رتّب من الأسرع للأبطأ\nالنوع: ترتيب\nA. CPU\nB. Cache\nC. RAM\nD. Storage',
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
  slotExpand: 'فتح السؤال',
  slotCollapse: 'قفل السؤال',
  slotLoading: 'بنجيب السؤال…',
  slotLoadFailed: 'مقدرناش نجيب السؤال',
  slotRetry: 'نجرّب تاني',
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
  paperEmpty: 'الورقة دي لسه فاضية — محتاجة أسئلة قبل النشر.',
  paperCount: '{n} سؤال · {marks} درجة',
  /** The publish guard's two refusals, stated where the admin can act. */
  improvementPaperEmpty: 'مينفعش تنشر امتحان بتحسين وورقة التحسين فاضية.',
  improvementPaperShared:
    'ورقة التحسين فيها {n} سؤال موجود في الورقة الأصلية. غيّرهم عشان التحسين يبقى امتحان حقيقي.',
  singleAttemptNote: 'كل كويز ليه محاولة واحدة. مفيش إعادة.',
  reviewMatrixReset: 'رجوع للإعداد الافتراضي',
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
  unlock: 'فتح المحاولة',
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
  slotRemove: 'حذف السؤال من الامتحان',
  poolName: 'اسم المجموعة',
  poolPoints: 'درجة كل سؤال في المجموعة',
  /** Aliased: also the aria-label prefix on the student question navigator. */
  columnQuestion: student.common.question,
  columnN: 'عدد المحاولات',
  distractorPicks: '{n} اختاروه',
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
  confirmReopen: 'نرجّع المحاولة دي للطالب؟',
  extraSecondsLabel: 'ثواني إضافية',
  grantAttemptConfirm: 'امنح الطالب ده محاولة إضافية؟',
  actionSucceeded: 'اتنفّذ',
  actionFailed: 'مقدرناش ننفّذ الإجراء — نحاول تاني',
} as const;

/**
 * «التحليلات» — the cohort analytics surface.
 *
 * Its own namespace rather than more keys on `admin`, because it is the one
 * screen whose vocabulary has to stay ruthlessly consistent: the same measure
 * is named the same thing on the overview, in the lesson table, on a student's
 * page and in the CSV header, or the reader stops trusting that they are the
 * same measure. Every label below is used in at least two of those four.
 */
const analytics = {
  title: 'التحليلات',
  lead: 'كل الأرقام عن المشاهدة والامتحانات — للمنصة كلها، ولكل درس، ولكل طالب.',
  navOverview: 'نظرة عامة',
  navLessons: 'تحليل الدروس',
  navStudents: 'تحليل الطلبة',

  // ── the window / filter bar ────────────────────────────────────────────
  window: 'الفترة',
  window7: 'آخر أسبوع',
  window30: 'آخر شهر',
  window90: 'آخر ٣ شهور',
  window365: 'آخر سنة',
  course: 'الكورس',
  allCourses: 'كل الكورسات',
  exportCsv: 'تنزيل CSV',
  exportHint: 'ملف UTF-8 بيفتح في إكسل وفي pandas على طول.',

  // ── students ───────────────────────────────────────────────────────────
  students: 'الطلبة',
  studentsTotal: 'إجمالي الطلبة',
  /** Of «إجمالي الطلبة», how many are actually in a course — and the
   *  denominator of every rate further down the screen. Replaced «كمّلوا
   *  التسجيل», which was 100% by construction. */
  enrolled: 'مشتركين في كورس',
  activeLast7: 'نشطين آخر أسبوع',
  activeLast30: 'نشطين آخر شهر',
  newLast30: 'جداد آخر شهر',
  /** The denominator, said out loud. Every rate on the screen divides by it,
   *  and a rate whose denominator is hidden is a rate nobody can check. */
  eligible: 'مشتركين في الكورس',

  // ── video ──────────────────────────────────────────────────────────────
  videoTitle: 'المشاهدة',
  watchers: 'اللي فتحوا فيديو',
  watchRate: 'نسبة اللي شافوا',
  watchHours: 'ساعات المشاهدة',
  lessonsOpened: 'دروس اتفتحت',
  lessonsCompleted: 'دروس اتخلصت',
  avgCompletion: 'متوسط نسبة المشاهدة',
  completionDistribution: 'الطلبة حسب نسبة اللي شافوه من الدرس',

  // ── quiz ───────────────────────────────────────────────────────────────
  quizTitle: 'الامتحانات',
  quizzes: 'امتحانات فيها محاولات',
  attempts: 'المحاولات',
  participants: 'اللي حلّوا',
  participationRate: 'نسبة اللي حلّوا',
  meanScore: 'متوسط الدرجة',
  medianScore: 'وسيط الدرجة',
  bestScore: 'أعلى درجة',
  passRate: 'نسبة النجاح',
  meanDuration: 'متوسط زمن الحل',
  medianDuration: 'وسيط زمن الحل',
  scoreDistribution: 'توزيع الدرجات',
  scoreDistributionHint: 'كل عمود = الطلبة اللي درجتهم في الشريحة دي من ١٠٠٪.',
  durationDistribution: 'الوقت اللي قعدوه في الامتحان',
  durationDistributionHint: 'المحاولات اللي في آخر عمود اتساب فيها الامتحان مفتوح — درجتها أقل حاجة يعتمد عليها.',

  // ── grade bands ────────────────────────────────────────────────────────
  gradeBands: 'التقديرات',
  gradeBandsHint: 'الحدود ثابتة (٨٥ / ٧٥ / ٦٥ / ٥٠) عشان المقارنة بين امتحان وامتحان تبقى ممكنة — النجاح والرسوب بيتحسبوا بنسبة نجاح كل امتحان لوحدها.',
  band: {
    a: 'امتياز · ٨٥٪ فأكتر',
    b: 'جيد جدًا · ٧٥–٨٥٪',
    c: 'جيد · ٦٥–٧٥٪',
    d: 'مقبول · ٥٠–٦٥٪',
    f: 'راسب · أقل من ٥٠٪',
  },
  bandShort: { a: 'امتياز', b: 'جيد جدًا', c: 'جيد', d: 'مقبول', f: 'راسب' },

  // ── engagement split ───────────────────────────────────────────────────
  engagement: 'الطلبة عملوا إيه',
  engagementHint: 'الأربع شرايح دي بتجمع على عدد المشتركين بالظبط — مفيش طالب في اتنين.',
  segment: {
    both: 'شاف الفيديو وحلّ الامتحان',
    videoOnly: 'شاف الفيديو بس',
    quizOnly: 'حلّ الامتحان بس',
    neither: 'مافتحش حاجة',
  },

  // ── time series ────────────────────────────────────────────────────────
  activityTitle: 'النشاط على مدار الوقت',
  watchMinutes: 'دقايق مشاهدة',
  attemptsPerDay: 'محاولات امتحان',
  activeStudents: 'طلبة نشطين',

  // ── breakdowns ─────────────────────────────────────────────────────────
  byYear: 'حسب الصف',
  byGovernorate: 'حسب المحافظة',
  yearLabel: 'الصف {n}',

  // ── lessons table ──────────────────────────────────────────────────────
  lessonsTitle: 'كل درس بالأرقام',
  columnLesson: 'الدرس',
  columnCourse: 'الكورس',
  columnSection: 'الوحدة',
  columnOpened: 'فتحوه',
  columnOpenRate: 'نسبة الفتح',
  columnCompleted: 'خلّصوه',
  columnAvgCompletion: 'متوسط المشاهدة',
  columnWatchHours: 'ساعات',
  columnQuizParticipants: 'حلّوا الامتحان',
  columnQuizMean: 'متوسط الدرجة',
  columnQuizPass: 'نسبة النجاح',
  columnQuizDuration: 'وسيط الزمن',
  noQuiz: 'مفيش امتحان',
  openLesson: 'فتح التحليل',

  // ── lesson detail ──────────────────────────────────────────────────────
  lessonRoster: 'الطلبة في الدرس ده',
  rosterHint: 'كل المشتركين في الكورس هنا — حتى اللي مافتحوش الدرس خالص.',
  columnStudent: 'الطالب',
  columnYear: 'الصف',
  columnGovernorate: 'المحافظة',
  columnWatched: 'مشاهدة',
  columnProgress: 'نسبة المشاهدة',
  columnAttempts: 'محاولات',
  columnBest: 'أعلى درجة',
  columnLast: 'آخر درجة',
  columnQuizTime: 'زمن الحل',
  columnLastSeen: 'آخر مرة',
  never: 'ولا مرة',
  notStarted: 'مافتحوش',

  // ── students table ─────────────────────────────────────────────────────
  studentsTitle: 'كل طالب بالأرقام',
  searchStudent: 'دور بالاسم...',
  previousPage: 'الصفحة اللي قبلها',
  nextPage: 'الصفحة اللي بعدها',
  columnEnrollments: 'كورسات',
  columnLessonsCompleted: 'دروس خلّصها',
  columnMeanScore: 'متوسط درجاته',
  columnLastActive: 'آخر نشاط',
  openStudent: 'فتح الملف',

  // ── student detail ─────────────────────────────────────────────────────
  studentProfile: 'ملف الطالب التحليلي',
  vsCohort: 'مقارنة بالمتوسط العام',
  cohortAverage: 'المتوسط العام',
  above: 'فوق المتوسط بـ {n}',
  below: 'تحت المتوسط بـ {n}',
  sameAsCohort: 'زي المتوسط',
  coursesTitle: 'الكورسات',
  attemptsTitle: 'كل محاولاته',
  columnQuiz: 'الامتحان',
  columnAttemptNo: 'المحاولة',
  columnState: 'الحالة',
  columnScore: 'الدرجة',
  columnSubmittedAt: 'اتسلّمت',
  attemptStates: {
    in_progress: 'شغّال عليها',
    overdue: 'اتأخر',
    submitted: 'اتسلّمت',
    pending_review: 'محتاجة تصحيح',
    abandoned: 'اتلغت',
  },
  progressStates: {
    not_started: 'مافتحوش',
    in_progress: 'لسه بيتفرّج',
    completed: 'خلّصه',
    passed: 'نجح',
    failed: 'رسب',
  },

  // ── the record: every lesson he opened ─────────────────────────────────
  recordTitle: 'سجل الطالب',
  recordLead: 'كل حاجة عملها: شاف إيه، قعد قد إيه، ودخل أنهي امتحانات.',
  recordUnavailable: 'مافيش سجل للحساب ده',
  /** Shown in place of the record when the analytics read fails or the account
   *  is not a student. The page's own controls stay usable above it. */
  recordUnavailableHint: 'السجل بيتبني للحسابات الطلابية بس. ولو ده حساب طالب فعلًا، تحديث الصفحة بيجيبه.',
  /** The way OUT of that panel. An operator who lands on the analytics record
   *  for an account that has none is still looking at a real person — this is
   *  the page that does serve them. */
  recordOpenAccount: 'فتح صفحة الحساب',
  /** Not `lessonsTitle` above: that one heads the COHORT table («كل درس
   *  بالأرقام»), and this one heads one student's own list. The column labels
   *  either table needs — `columnLesson`, `columnCourse`, `columnWatched`,
   *  `columnProgress`, `columnLastSeen` — are shared and already defined. */
  recordLessonsTitle: 'الدروس اللي فتحها',
  recordLessonsHint: 'مرتّبة بالأحدث. الدرس اللي مافتحوش خالص مش موجود هنا.',
  columnOpens: 'فتحه',
  timesShort: 'مرة',
  completedVia: {
    auto: 'تلقائيًا',
    manual: 'بنفسه',
    dwell: 'بعد قراية الدرس',
  },

  // ── the record: which devices the ACCOUNT signs in from ────────────────
  //
  // ⚠️ Wording rule. These rows are per-LOGIN, and nothing joins them to a
  // lesson or an attempt — no watch table carries a device. So every string
  // here says «بيدخل من», never «اتفرّج من». A label that implied the second
  // would be a claim the database cannot support.
  devicesTitle: 'بيدخل من أنهي أجهزة',
  devicesHint: 'ده جهاز الدخول للحساب. مابنعرفش الدرس نفسه اتشاف من أنهي جهاز.',
  /** «مافيش أجهزة متسجلة», not «عمره ما دخل» — the second is a claim about the
   *  student, and it is not one an empty table can support: the account may
   *  predate the device log, or its rows may have been erased by a ban that
   *  was later lifted. The table is empty; that is all we know. */
  devicesEmpty: 'مافيش أجهزة متسجلة',
  /** Not the same fact as the line above, and the difference matters: banning
   *  DELETES the device rows, so an empty list on a banned account means we
   *  erased them, not that he never signed in. */
  devicesClearedByBan: 'الأجهزة اتمسحت لما الحساب اتحظر',
  /** Two counts, never one: a row is written per SIGN-IN, so «٩٠ مرة دخول من
   *  جهازين» is the truth and «٩٠ جهاز» is not. */
  devicesCount: '{n} جهاز مختلف',
  loginsCount: 'دخل {n} مرة',
  /** Under a type's bar: how many machines of that kind sit behind the count
   *  of logins the bar is encoding. */
  devicesOfType: '{n} جهاز',
  recentLogins: 'آخر مرات الدخول',
  lastLoginAt: 'آخر دخول',
  deviceRevoked: 'اتقفل',
  columnDevice: 'الجهاز',
  columnLoggedInAt: 'دخل',
  deviceTypes: {
    desktop: 'كمبيوتر',
    mobile: 'موبايل',
    tablet: 'تابلت',
    unknown: 'جهاز غير معروف',
  },

  // ── section bands, and where each one takes you ────────────────────────
  //
  // Every number on this screen counts rows that live on some other screen.
  // These are the labels on the links that go and get them — worded as the
  // destination, never as «اعرف أكتر», so the reader knows before pressing.
  sectionWhoTitle: 'مين موجود',
  sectionWhoLead: 'الطلبة المشتركين، ومين منهم لسه بيذاكر فعلًا.',
  sectionWatchTitle: 'شافوا الفيديوهات؟',
  sectionWatchLead: 'كل رقم هنا مقسوم على عدد المشتركين النشطين، والمقام مكتوب جنبه.',
  sectionQuizTitle: 'حلّوا الامتحانات؟',
  sectionQuizLead: 'الدرجات كلها نسبة من مجموع كل امتحان لوحده — عشان المقارنة تبقى ممكنة.',
  sectionBreakdownTitle: 'التفاصيل',
  sectionBreakdownLead: 'نفس الأرقام مقسّمة — بالصف، بالمحافظة، وعلى مدار الوقت.',
  goToStudents: 'تحليل الطلبة',
  goToLessons: 'تحليل الدروس',
  goToAttempts: 'المحاولات',
  goToStudentRecords: 'بيانات الطلبة',
  goToCourse: 'فتح الكورس',
  goToLesson: 'فتح الدرس',
  goToQuizAnalysis: 'تحليل أسئلة الامتحان',
  goToQuizAttempts: 'محاولات الامتحان ده',
  /** On a row that is itself a link — screen-reader only, so the destination
   *  is never «اضغط هنا» three hundred times in a table. */
  openRow: 'فتح {name}',

  // ── chart chrome ───────────────────────────────────────────────────────
  showTable: 'اعرض الأرقام',
  hideTable: 'اخفي الأرقام',
  /** The accessible name of every chart's table fallback. */
  tableFallbackLabel: 'أرقام الرسم',
  columnCategory: 'البند',
  columnValue: 'العدد',
  columnShare: 'النسبة',
  noData: 'مفيش بيانات في الفترة دي',
  /** A rate with no denominator. Never «٠٪» — that is a claim we cannot make. */
  unknown: '—',
  /** A rate that is real but rounds to nothing. «٠٪» would say the opposite. */
  lessThanOnePercent: 'أقل من ١٪',
  /** …and its twin at the top: not-quite-everyone must not read as everyone. */
  almostAllPercent: 'أكتر من ٩٩٪',
  ofTotal: 'من {n}',
  minutesShort: 'د',
  hoursShort: 'س',
  secondsShort: 'ث',
  underMinute: 'أقل من دقيقة',
  overSeconds: 'أكتر من {n}',
  rangeSeconds: '{from}–{to}',
} as const;

/**
 * The full table, student namespaces included — see the header for why this
 * composes rather than replaces. Property order is irrelevant; the admin keys
 * go last only so a reader can see at a glance what this file adds.
 */

const marketing = {
  // ── the section landing (campaigns list) ────────────────────────────────
  title: 'التسويق',
  lead: 'ابعت رسالة واتساب لكل الطلبة أو لمجموعة منهم — من رقمك، بالتدريج، من غير ما ينحظر.',
  newCampaign: 'حملة جديدة',
  backToList: 'كل الحملات',

  // ── device pairing ───────────────────────────────────────────────────────
  deviceTitle: 'رقم الواتساب',
  deviceLead: 'الرقم اللي الحملات هتتبعت منه. رقمك الشخصي، من غير أي API رسمي — زي ما تفتح واتساب ويب.',
  deviceDisabled: 'الخدمة لسه مش متظبطة على السيرفر.',
  deviceDisabledHint: 'المطوّر لازم يضيف WA_SERVICE_URL وWA_SERVICE_TOKEN الأول.',
  deviceUnreachable: 'مقدرناش نوصل لخدمة الواتساب',
  deviceDisconnected: 'مفيش رقم متربط',
  deviceLinking: 'امسح الكود ده من واتساب على موبايلك',
  deviceLinkingSteps: 'واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز',
  deviceConnected: 'متربط',
  /** `{phone}` */
  deviceConnectedAs: 'متربط برقم {phone}',
  linkButton: 'اربط رقم جديد',
  linkPending: 'بنجهّز الكود…',
  unlinkButton: 'افصل الرقم',
  unlinkConfirm: 'تفصل الرقم ده؟ الحملات الشغالة هتوقف.',

  // ── لما الربط يقف من غير ما يوصل لكود ──────────────────────────────
  // بيانات الاقتران بتتخزن على قرص الخدمة وبتفضل مكانها بين النشرات. لو
  // اتكتبت نص كتابة — اتقفل الاتصال في نص المصافحة، أو الكود خلص وهو
  // بيتحفظ — واتساب بيفضل يحاول يرجّع الجلسة القديمة بدل ما يطلع كود
  // جديد، فالشاشة تفضل «مفيش رقم متربط» مهما دوست «اربط».
  //
  // الزرار ده بيمسح البيانات دي ويخلّي المحاولة الجاية تبدأ من الصفر.
  // قبل كده مكانش ليه أي طريق من الشاشة: «افصل الرقم» كان بيظهر لما
  // الجهاز يكون **متربط** بس — يعني بالظبط الحالة اللي مش محتاجاه.
  resetButton: 'امسح البيانات وابدأ من الأول',
  resetConfirm: 'هنمسح بيانات الربط المحفوظة ونبدأ من الصفر. مش هيتفصل أي رقم شغّال.',
  /** Under the badge, whenever the sidecar reported WHY it is not connected. */
  deviceDetailLabel: 'آخر سبب:',
  /** Shown beside the link button once a first attempt produced no code. */
  linkNoCodeHint: 'لو دوست وما ظهرش كود خلال شوية ثواني، امسح البيانات وابدأ من الأول.',

  // ── the audience picker ──────────────────────────────────────────────────
  audienceTitle: 'مين هيوصله؟',
  audienceStudents: 'الطلبة',
  audienceStudentsHint: 'رقم الطالب اللي مسجّل بيه في المنصة',
  audienceParents: 'أرقام أولياء الأمور',
  audienceParentsHint: 'محتاجة تفكير قبل ما تفتحها — الأهل ما وافقوش على المنصة، وافقوا على رقمهم بس',
  audienceYears: 'السنة الدراسية',
  audienceYearsAll: 'كل السنين',
  audienceSchoolStreams: 'المدرسة',
  audienceSchoolStreamsAll: 'كل المدارس',
  audienceCourses: 'مسجّلين في كورس',
  audienceCoursesAll: 'بغضّ النظر عن الكورس',
  audienceNotSubscribedOnly: 'بس اللي لسه مش مشتركين',
  audienceNotSubscribedOnlyHint: 'بيستبعد اللي عنده اشتراك سارٍ في الكورس ده دلوقتي — يفضل بس اللي مسجّل ومحاولش يشترك، أو اشتراكه خلص',
  audienceNotSubscribedOnlyNeedsCourse: 'اختار كورس واحد على الأقل الأول عشان الفلتر ده يشتغل',
  audienceExtraPhones: 'أرقام تانية',
  audienceExtraPhonesHint: 'رقم في كل سطر. للناس اللي لسه مش مسجّلين في المنصة.',
  audiencePreviewLoading: 'بنحسب العدد…',
  /** `{n}` */
  audiencePreviewCount: 'هيوصله {n} رقم',
  audiencePreviewNone: 'مفيش حد هيوصله بالفلاتر دي',
  /** `{n}` */
  audienceUnreachable: '{n} رقم متجاهَل — مش رقم مصري صحيح',
  /** `{n}` */
  audienceOptedOut: '{n} رقم طلب إيقاف قبل كده',
  /** `{minutes}` — see `formatDuration`-style rendering on the page itself. */
  audienceEstimate: 'هياخد حوالي {duration} عشان يوصل للكل',

  // ── the message ────────────────────────────────────────────────────────
  messageTitle: 'الرسالة',
  fieldName: 'اسم الحملة',
  fieldNameHint: 'للأدمن بس — الطالب ما يشوفهوش',
  fieldBody: 'النص',
  fieldBodyHint: 'اكتب {{الاسم}} في أي مكان وهيتحول لاسم كل واحد. الأرقام اللي من غير اسم هتتبعتلها الجملة من غيره.',
  fieldImage: 'صورة (اختياري)',
  fieldImagePick: 'اختار من المكتبة',
  fieldImageRemove: 'شيل الصورة',
  fieldLink: 'لينك (اختياري)',
  fieldLinkHint: 'هيتضاف آخر الرسالة، إلا لو كتبت {{اللينك}} في مكان تاني بنفسك',
  previewTitle: 'شكل الرسالة',

  // ── pacing ─────────────────────────────────────────────────────────────
  pacingTitle: 'السرعة والأمان',
  pacingLead: 'دي أرقام أمان عشان رقمك ميتحظرش. متتعداش الافتراضي إلا لو عارف بتعمل إيه.',
  pacingMinDelay: 'أقل مدة بين رسالتين (ثانية)',
  pacingMaxDelay: 'أكتر مدة بين رسالتين (ثانية)',
  pacingBatchSize: 'كام رسالة قبل الراحة',
  pacingBatchPause: 'الراحة قد إيه (دقيقة)',
  pacingDailyCap: 'أقصى عدد رسايل في اليوم',
  pacingWindowStart: 'من الساعة',
  pacingWindowEnd: 'لحد الساعة',
  pacingWindowHint: 'بتوقيت القاهرة. برّه المواعيد دي الحملة بتستنى.',

  // ── confirm & create ─────────────────────────────────────────────────────
  createButton: 'جهّز الحملة',
  createConfirmTitle: 'متأكد؟',
  /** `{n}` and `{duration}` */
  createConfirmBody: 'الحملة هتتبعت لـ {n} رقم، وهتاخد حوالي {duration}. مينفعش تتراجع بعد ما تبدأ غير بالإلغاء.',
  createConfirmGo: 'أيوه، جهّزها',

  // ── the campaigns list ───────────────────────────────────────────────────
  listEmpty: 'لسه مفيش حملات. ابدأ بواحدة.',
  colName: 'الاسم',
  colStatus: 'الحالة',
  colProgress: 'التقدّم',
  colCreated: 'اتعملت',
  statusDraft: 'مسودة',
  statusRunning: 'شغالة',
  statusPaused: 'واقفة',
  statusDone: 'خلصت',
  statusCancelled: 'اتلغت',

  // ── the campaign detail ──────────────────────────────────────────────────
  detailBack: 'كل الحملات',
  startButton: 'ابدأ',
  resumeButton: 'كمّل',
  pauseButton: 'وقّف',
  cancelButton: 'إلغاء الحملة',
  cancelConfirm: 'تلغي الحملة دي؟ اللي لسه ما وصلهمش مش هيوصلهم حاجة، بس السجل بيفضل.',
  deleteButton: 'حذف',
  deleteConfirm: 'تحذف المسودة دي نهائي؟',
  editButton: 'تعديل',
  /** `{sent}` / `{total}` */
  progressLabel: '{sent} من {total}',
  /** `{n}` */
  pendingLabel: 'فاضل {n}',
  /** `{n}` */
  failedLabel: '{n} فشل',
  /** `{n}` */
  skippedLabel: '{n} اتجاهل',
  /** `{time}` */
  nextSendAt: 'الرسالة الجاية الساعة {time}',
  waitingWindow: 'مستنية الشباك يفتح',
  waitingCap: 'مستنية بكرة — وصل السقف اليومي',
  recipientsTitle: 'المستلمين',
  recipientFilterAll: 'الكل',
  recipientFilterPending: 'لسه',
  recipientFilterSent: 'اتبعت',
  recipientFilterFailed: 'فشل',
  recipientFilterSkipped: 'اتجاهل',
  colPhone: 'الرقم',
  colRecipientStatus: 'الحالة',
  colSentAt: 'وقت الإرسال',
  colError: 'السبب',
  noName: 'من غير اسم',

  // ── opt-outs ──────────────────────────────────────────────────────────
  optOutsTitle: 'طلبوا الإيقاف',
  optOutsLead: 'الأرقام دي معملهاش أي حملة تانية. بتتضاف تلقائي لما حد يرد بـ«قف».',
  optOutsEmpty: 'محدش طلب إيقاف لسه.',
  addOptOut: 'إضافة رقم بإيدك',
  removeOptOut: 'إلغاء الإيقاف',
  colReason: 'السبب',
  colDate: 'التاريخ',
} as const;

export const copy = { ...student, admin, adminNews, quizAdmin, analytics, marketing } as const;

export type AdminCopy = typeof copy;
