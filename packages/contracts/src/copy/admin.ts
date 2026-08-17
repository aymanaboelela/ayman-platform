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
    outreach: 'رسايلي للطلبة',
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
    retry: 'جرّب تاني',
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
      'التركيبة دي (نظام + صف + مسار + مادة) مش موجودة في المناهج، فمينفعش الكورس يتحفظ بيها. غيّر واحد منهم.',
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
    videoCheckFailed: 'الفحص مانجحش — جرّب تاني',
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
    // The disclosure button in a section header. It is an icon-only control
    // whose chevron is `aria-hidden`, so without a label it announces nothing —
    // and it is the only thing in that row that opens the section, now that the
    // header is no longer a `<summary>`.
    expand: 'افتح القسم',
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
    durationRetry: 'جرّب تاني',
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
      'يوتيوب مارضيش يقول مدة الفيديو للسيرفر دلوقتي — ده بيحصل أحياناً ومالوش علاقة بالفيديو. اكتب المدة بالثواني، أو جرّب تاني بعد شوية.',
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
    previewPlay: 'شغّل الفيديو',
    previewClose: 'اقفل المعاينة',
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
      'المحاضرة دي فيها بريزنتيشن أساسي واحد خلاص. امسح القديم الأول، أو ضيف ده كـ«ملف».',
    /** Any other refusal from the add endpoint — never the transport's own
     *  English, which is what used to be shown. */
    addFailed: 'مقدرناش نضيف المادة دي. جرّب تاني.',
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
    assetChooseExisting: 'اختار من المكتبة',
    assetUploadNew: 'ارفع صورة جديدة',
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
  outreach: {
    eyebrow: 'رسايلك',
    title: 'رسايلي للطلبة',
    lead: 'المنصة بتبعت للطالب رسالة باسمك بعد كل امتحان، ولو ساب كويز من غير حل، ولو خلّص درس. كل رسالة بصيغة مختلفة — مفيش تكرار.',

    // ── the strip ────────────────────────────────────────────────────
    statSent: 'رسايل اتبعتت',
    statRecent: 'آخر ٣٠ يوم',
    statSeen: 'الطالب فتحها',
    statReplied: 'ردّوا عليك',
    statRepliedHint: 'أقوى إشارة إن الرسالة وصلت فعلاً',
    /** `{date}` — the activation floor. */
    activeSince: 'المنصة بتكتب عن اللي حصل بعد {date} بس — اللي قبل كده مش هيتبعت عنه حاجة.',

    // ── the log ──────────────────────────────────────────────────────
    logTitle: 'اللي اتبعت',
    logEmpty: 'لسه مفيش رسايل اتبعتت.',
    logEmptyHint: 'أول ما طالب يخلّص كويز، هتلاقي الرسالة اللي راحتله هنا بالنص بتاعها.',
    filterAll: 'الكل',
    openThread: 'افتح المحادثة',
    seen: 'اتقرت',
    unseen: 'لسه ما اتقرتش',
    replied: 'ردّ عليك',
    /** Above the facts strip on a row: WHY this message said what it said. */
    whyLabel: 'اتبعتت عشان',
    /** `{quiz}` and `{score}`. */
    whyQuizResult: 'خلّص «{quiz}» وجاب {score}٪',
    whyQuizNudge: 'خلّص «{lesson}» ومحلّش الكويز',
    whyLessonPraise: 'خلّص «{lesson}» واللي مالوش كويز',
    whyWhatsappInvite: 'دعوة لجروب الواتساب',
    /** `{topics}` — the weak areas the message named. */
    whyFocus: 'ركّزت على: {topics}',

    // ── the kinds ────────────────────────────────────────────────────
    kindQuizResult: 'بعد الامتحان',
    kindQuizNudge: 'كويز ما اتحلّش',
    kindLessonPraise: 'خلّص درس',
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
    quizNudgeHint: 'لو خلّص الدرس وساب الكويز',
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
    settingsNote: 'مفيش زرار «ابعت للكل» هنا، وده مقصود: كل رسالة سببها حاجة عملها الطالب نفسه.',
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
    roleChangeFailed: 'مقدرناش نغيّر الدور — حاول تاني',
    roleChangeSelfError: 'مينفعش تغيّر دورك إنت',
    roleChangeLastAdminError: 'ده آخر مسؤول في المنصة — مينفعش تلغي صلاحياته',
    saveSuccess: 'اتحفظت بيانات الطالب',
    saveFailed: 'مقدرناش نحفظ — حاول تاني',

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
    banFailed: 'مقدرناش نوقف الحساب — حاول تاني',
    banSelfError: 'مينفعش توقف حسابك إنت',
    banLastAdminError: 'ده آخر مسؤول نشط في المنصة — مينفعش توقفه',

    unban: 'رفع الإيقاف',
    unbanTitle: 'رفع الإيقاف عن الحساب',
    unbanBody:
      'الطالب هيقدر يدخل تاني عادي. مش هنرجّع الأجهزة اللي كانت مفتوحة — هيسجّل دخول من الأول.',
    unbanConfirm: 'ارفع الإيقاف',
    unbanSuccess: 'اترفع الإيقاف',
    unbanFailed: 'مقدرناش نرفع الإيقاف — حاول تاني',

    delete: 'مسح الحساب نهائيًا',
    deleteTitle: 'مسح الحساب نهائيًا',
    /**
     * Names what is destroyed, item by item, because "are you sure?" is not
     * information. An admin who is about to erase a year of quiz history
     * should be reading that sentence, not a generic warning.
     */
    deleteBody:
      'الحساب ده هيتمسح خالص ومش هينفع يترجع. هيتمسح معاه: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. لو إنت عايز توقفه بس، استخدم «إيقاف الحساب» — ده بيترجع.',
    /** `{email}` — the account's own address, which the admin must retype. */
    /**
     * «رقم أو إيميل» rather than naming one: the dialog prints the exact
     * string underneath, and which of the two it is depends on the account —
     * a phone for anyone who registered after the phone became the identity,
     * an email for the older accounts and for admins. Promising «الإيميل» to
     * an operator who is then shown a phone number reads as a bug.
     */
    deleteConfirmIdentityLabel: 'اكتب رقم الحساب أو إيميله للتأكيد',
    deleteConfirmIdentityHint: 'اكتب: {identity}',
    deleteReason: 'سبب المسح',
    deleteReasonPlaceholder: 'وضّح سبب المسح — هيتسجل في سجل النشاط قبل ما الحساب يروح',
    deleteConfirm: 'امسح نهائيًا',
    deleteSuccess: 'الحساب اتمسح',
    deleteFailed: 'مقدرناش نمسح الحساب — حاول تاني',
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
     * and the friction becomes one typed word. The word is «امسح» and not
     * «نعم» on purpose: a yes/no dialog is the one an admin dismisses on
     * autopilot.
     */
    bulkDelete: 'امسح المحدد',
    /** `{n}` — how many rows are selected. */
    bulkDeleteTitle: 'مسح {n} حساب نهائيًا',
    bulkDeleteBody:
      'الحسابات دي هتتمسح خالص ومش هينفع ترجع. هيتمسح معاها: تسجيل الدخول، الاشتراكات في الكورسات، كل محاولات الامتحانات وإجاباتها، والإشعارات. لو عايز توقفهم بس، افتح الحساب واستخدم «إيقاف الحساب» — ده بيترجع.',
    bulkDeleteListLabel: 'الحسابات اللي هتتمسح',
    /** `{n}` — the accounts beyond the ones the dialog had room to list. */
    bulkDeleteListMore: 'و{n} حساب كمان',
    bulkDeleteConfirmLabel: 'اكتب «امسح» للتأكيد',
    /** The exact word the field above must contain. Compared, not displayed. */
    bulkDeleteConfirmWord: 'امسح',
    bulkDeleteReason: 'سبب المسح',
    bulkDeleteReasonPlaceholder: 'وضّح سبب المسح — هيتسجل في سجل النشاط لكل حساب',
    bulkDeleteConfirm: 'امسحهم نهائيًا',
    /** `{n}` — how many were actually deleted. */
    bulkDeleteSuccess: 'اتمسح {n} حساب',
    /** `{n}` — how many refused. Shown beside the success line, not instead. */
    bulkDeletePartial: '{n} حساب ما اتمسحوش — اتساب متحددين',
    bulkDeleteFailed: 'مقدرناش نمسح — حاول تاني',
    bulkDeleteNoneDeleted: 'مفيش حساب اتمسح',
    /** Why one row refused, shown in the row list after a partial run. */
    bulkDeleteReasonSelf: 'حسابك إنت',
    bulkDeleteReasonLastAdmin: 'آخر مسؤول',
    bulkDeleteReasonAuthored: 'مؤلف محتوى',
    bulkDeleteReasonMissing: 'اتمسح قبل كده',
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

    // ── Permanent delete ──────────────────────────────────────────────
    /**
     * «امسح خالص» — deliberately NOT «حذف».
     *
     * The library already has «أرشفة» beside this button, and an admin
     * skimming two destructive-looking words has to be able to tell which one
     * they can undo. «خالص» is doing the load-bearing work in that pair.
     */
    deleteForever: 'امسح خالص',
    deleteTitle: 'تمسح الصورة خالص؟',
    /**
     * Says what goes and where from, because the difference from archiving is
     * the entire decision being made. «مش هتترجع» is the sentence the whole
     * dialog exists to deliver.
     */
    deleteWarning:
      'الصورة هتتشال من الداتا بيز ومن السيرفر نهائيًا، ومش هتترجع تاني. لو عايز تخبّيها بس من غير ما تمسحها، استخدم «أرشفة».',
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
    deleteFailed: 'مقدرناش نمسح الصورة — حاول تاني',
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
    recrop: 'عدّل القص',
    recropTitle: 'عدّل قص الصورة',
    /**
     * The bytes change, every reference to the asset does not — which is the
     * fact that decides whether an instructor uses this or uploads a second
     * copy. Worth one sentence.
     */
    recropHint: 'التعديل هيتطبّق في كل مكان الصورة دي مستخدمة فيه.',
    recropLoading: 'بنجيب الصورة الأصلية…',
    recropSuccess: 'اتعدّلت الصورة',
    recropFailed: 'مقدرناش نجيب الصورة عشان نعدّلها — حاول تاني',
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
    kindTimeoutHint: 'الطلب عدّى ١٥ ثانية من غير رد، فالصفحة وقفت استنيان. غالبًا الـ API كان واقع أو بطيء وقتها.',
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
    ordering: 'ترتيب',
    essay: 'سؤال مقالي',
  },
  /** Above the rows on an ordering question. The single fact an instructor has
   *  to know before typing: there is nothing to tick here, the order they type
   *  IS the key, and the student is served the same items shuffled. */
  orderingHint: 'اكتب العناصر بالترتيب الصحيح — ده هو المفتاح. الطالب بيشوفها متبعثرة ويرتبها.',
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
  exportCsv: 'نزّل CSV',
  exportHint: 'ملف UTF-8 بيفتح في إكسل وفي pandas على طول.',

  // ── students ───────────────────────────────────────────────────────────
  students: 'الطلبة',
  studentsTotal: 'إجمالي الطلبة',
  onboarded: 'كمّلوا التسجيل',
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
  gradeBandsHint: 'الحدود ثابتة (٨٥ / ٧٥ / ٦٥ / ٥٠) عشان تقدر تقارن امتحان بامتحان — النجاح والرسوب بيتحسبوا بنسبة نجاح كل امتحان لوحدها.',
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
  openLesson: 'افتح التحليل',

  // ── lesson detail ──────────────────────────────────────────────────────
  lessonRoster: 'الطلبة في الدرس ده',
  rosterHint: 'كل مشترك في الكورس موجود هنا — حتى اللي مافتحش الدرس خالص.',
  columnStudent: 'الطالب',
  columnYear: 'الصف',
  columnGovernorate: 'المحافظة',
  columnWatched: 'اتفرّج',
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
  openStudent: 'افتح الملف',

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
  recordUnavailableHint: 'السجل بيتبني للحسابات الطلابية بس. لو ده حساب طالب فعلًا، جرّب تحدّث الصفحة.',
  /** The way OUT of that panel. An operator who lands on the analytics record
   *  for an account that has none is still looking at a real person — this is
   *  the page that does serve them. */
  recordOpenAccount: 'افتح صفحة الحساب',
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
  sectionQuizLead: 'الدرجات كلها نسبة من مجموع كل امتحان لوحده — عشان تقدر تقارن.',
  sectionBreakdownTitle: 'التفاصيل',
  sectionBreakdownLead: 'نفس الأرقام مقسّمة — بالصف، بالمحافظة، وعلى مدار الوقت.',
  goToStudents: 'روح لتحليل الطلبة',
  goToLessons: 'روح لتحليل الدروس',
  goToAttempts: 'روح للمحاولات',
  goToStudentRecords: 'روح لبيانات الطلبة',
  goToCourse: 'افتح الكورس',
  goToLesson: 'افتح الدرس',
  goToQuizAnalysis: 'تحليل أسئلة الامتحان',
  goToQuizAttempts: 'محاولات الامتحان ده',
  /** On a row that is itself a link — screen-reader only, so the destination
   *  is never «اضغط هنا» three hundred times in a table. */
  openRow: 'افتح {name}',

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
export const copy = { ...student, admin, adminNews, quizAdmin, analytics } as const;

export type AdminCopy = typeof copy;
