/**
 * The single Arabic string table. No component may contain a user-facing literal.
 * This is what makes adding English later a routing change rather than a rewrite.
 */
export const copy = {
  site: {
    name: 'أيمن أبو العلا',
    /**
     * The name under a home-screen icon, on both platforms.
     *
     * Short because both truncate: Android cuts a launcher label past roughly
     * 12 characters and iOS is tighter still, so «منصة أيمن أبو العلا» would
     * arrive as «منصة أيمن أبو…» — a name that trails off. This is the
     * deliberate short form rather than a truncated accident.
     *
     * Read by BOTH `app/manifest.ts` (`short_name`, for Android) and
     * `appleWebApp.title` in `lib/seo/metadata.ts` (for iOS, which ignores the
     * manifest entirely). It was hardcoded in the manifest before iOS needed
     * the same string; two copies of a name that must match is how they stop
     * matching.
     */
    shortName: 'منصة أيمن',
    /**
     * The PLATFORM, as opposed to the person above. Kept separate because the
     * two are searched separately — "أيمن أبو العلا" is a name query, "منصة
     * أيمن أبو العلا" is a navigational one — and because the brand lockup,
     * the footer and the JSON-LD `Person` all want the bare name while every
     * page TITLE wants this. See `seo.titleTemplate`.
     */
    platformName: 'منصة أيمن أبو العلا',
    tagline: 'البرمجة وعلوم الحاسب — نظام البكالوريا المصرية',
    instructor: 'المهندس أيمن أبو العلا',
  },

  /**
   * Search-engine surface. Everything here is metadata — none of it renders as
   * visible page copy, which is why the hamza-less spellings below are allowed
   * to sit next to the correct ones.
   *
   * ⚠️ Egyptians overwhelmingly type Arabic without hamza: `ايمن ابو العلا`,
   * not `أيمن أبو العلا`. Google's Arabic normaliser folds most of that, but
   * not reliably for proper nouns, and Bing/Yandex fold less. Carrying both
   * forms explicitly in `keywords` and in the JSON-LD `alternateName` costs
   * nothing and is the difference between ranking for the query people
   * actually type and ranking for the one we wish they typed.
   *
   * The visible copy is NEVER misspelled to chase this — that is what these
   * fields are for.
   */
  seo: {
    /** `%s | منصة أيمن أبو العلا` — the target phrase on every page's title. */
    defaultTitle: 'منصة أيمن أبو العلا — البرمجة وعلوم الحاسب للبكالوريا المصرية',
    description:
      'منصة المهندس أيمن أبو العلا لتعليم البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية — شرح بالفيديو، ملخصات وملفات، امتحانات وكويزات على كل درس، ومسار تعليمي مرتّب خطوة بخطوة.',
    /** Two lines, ≤160 chars, used as the OG/Twitter description on the landing page. */
    homeDescription:
      'ابدأ البرمجة وعلوم الحاسب صح مع المهندس أيمن أبو العلا: دروس فيديو، ملفات ومذكرات، وامتحانات على كل درس — بمسار مرتّب لطلبة البكالوريا المصرية.',
    catalogDescription:
      'كل كورسات البرمجة وعلوم الحاسب على منصة أيمن أبو العلا — مرتّبة بالصف الدراسي والنظام والمادة، بشرح فيديو وملفات وامتحانات.',
    /**
     * Every way a student might reasonably type the platform or the name.
     * `<meta name="keywords">` is ignored by Google and weighted lightly by
     * Bing/Yandex; the real payload is `alternateName` in the JSON-LD, which
     * these feed too.
     */
    alternateNames: [
      'منصة أيمن أبو العلا',
      'منصه ايمن ابو العلا',
      'منصة ايمن ابو العلا',
      'أيمن أبو العلا',
      'ايمن ابو العلا',
      'المهندس أيمن أبو العلا',
      'مهندس ايمن ابو العلا',
      'م. ايمن ابو العلا',
      'Ayman Abo El Ela',
      'Ayman Aboelela',
      'Ayman Abo Elela Platform',
    ],
    keywords: [
      'منصة أيمن أبو العلا',
      'منصه ايمن ابو العلا',
      'ايمن ابو العلا',
      'أيمن أبو العلا',
      'ايمن ابو العلا برمجة',
      'منصة ايمن ابو العلا برمجة',
      'مهندس ايمن ابو العلا',
      'Ayman Abo El Ela',
      'برمجة بكالوريا',
      'علوم الحاسب البكالوريا',
      'البكالوريا المصرية برمجة',
      'شرح برمجة بكالوريا',
      'كورس برمجة للبكالوريا',
      'تعلم البرمجة بالعربي',
      'منصة تعليمية برمجة مصر',
      'امتحانات برمجة بكالوريا',
    ],
    /** `jobTitle` on the `Person` entity — what a knowledge panel would show. */
    jobTitle: 'مدرّس البرمجة وعلوم الحاسب',
    /** `description` on the `Person` entity. */
    personDescription:
      'المهندس أيمن أبو العلا — مدرّس البرمجة وعلوم الحاسب لطلبة نظام البكالوريا المصرية، وصاحب منصة أيمن أبو العلا التعليمية.',
  },
  nav: {
    home: 'الرئيسية',
    courses: 'الكورسات',
    about: 'عن المنصة',
    contact: 'تواصل معنا',
    login: 'تسجيل الدخول',
    register: 'حساب جديد',
    dashboard: 'حسابي',
    path: 'مساري',
    // ── the signed-in shell ──────────────────────────────────────────────
    essentials: 'التأسيس',
    playground: 'جرّب الكود',
    devices: 'أجهزتي',
    account: 'الحساب',
    accountMenu: 'قائمة الحساب',
    openMenu: 'فتح القائمة',
    logout: 'تسجيل الخروج',
    loggingOut: 'جارٍ الخروج…',
    logoutFailed: 'مقدرناش نسجّل خروجك. حاول تاني.',
    adminPanel: 'لوحة التحكم',
    // ── the rail (slice 1) ───────────────────────────────────────────────
    /** `aria-label` on the rail's primary <nav>. Distinct from `accountMenu`,
     *  which labels the dropdown — a screen reader listing landmarks has to be
     *  able to tell the two apart. */
    mainNav: 'التنقّل الأساسي',
    railCourses: 'كورساتي',
    railCoursesEmpty: 'لسه مفيش كورسات',
    results: 'نتائجي',
    profile: 'بروفايلي',
    railAllCourses: 'كل الكورسات',
    collapseRail: 'اطوِ القائمة',
    expandRail: 'افتح القائمة',
    backToSite: 'الموقع الرئيسي',
    /** The marketing nav's signed-in state. A student who is already in does
     *  not need to be sold an account — they need the way back to their own
     *  screen, named the same thing the rail names it. */
    continueStudying: 'كمّل مذاكرة',
  },
  theme: {
    toggle: 'تبديل المظهر',
    light: 'فاتح',
    dark: 'داكن',
    system: 'حسب النظام',
  },
  onboarding: {
    title: 'كمّل بيانات حسابك',
    subtitle: 'شوية معلومات سريعة عشان نعرف نوريك الكورسات اللي تخصّك إنت بس',
    /** Prefix, rendered as `{identityGreeting} {name}` — the name comes from
     *  the session, so it can't be baked into one string here. */
    identityGreeting: 'أهلاً يا',
    /** Sits under the greeting. Does two jobs the student needs done at once:
     *  says where the prefilled values came from, and says they can be
     *  changed — without which a wrong name from Google looks permanent. */
    identityNote: 'جبنا البيانات دي من حسابك. غيّر أي حاجة مش مظبوطة.',
    step1Title: 'مين إنت',
    step2Title: 'إنت فين',
    step3Title: 'بتدرس إيه',
    optionalTitle: 'بيانات زيادة',
    optionalSubtitle: 'اختيارية دلوقتي — تقدر تسيبها وترجعلها بعدين',
    fullName: 'الاسم الكامل',
    fullNamePlaceholder: 'اكتب اسمك بالكامل',
    gender: 'النوع',
    genderPlaceholder: 'اختر النوع',
    genderMale: 'ذكر',
    genderFemale: 'أنثى',
    genderError: 'اختر النوع',
    phone: 'رقم الهاتف',
    // `مثال:` is load-bearing, not decoration. A bare `01012345678` is a
    // well-formed Egyptian number, so in an empty field it reads as a value
    // that is already filled in — students hit "احفظ" and got "رقم الهاتف
    // مطلوب" on a field that looked complete.
    phonePlaceholder: 'مثال: 01012345678',
    governorate: 'المحافظة',
    governoratePlaceholder: 'اختر محافظتك',
    schoolName: 'اسم المدرسة',
    schoolNamePlaceholder: 'اختياري',
    system: 'النظام الدراسي',
    systemPlaceholder: 'اختر النظام الدراسي',
    year: 'الصف الدراسي',
    yearPlaceholder: 'اختر الصف الدراسي',
    track: 'المسار',
    trackPlaceholder: 'اختر المسار',
    electiveSubject: 'المادة الاختيارية',
    electiveSubjectPlaceholder: 'اختر المادة الاختيارية',
    fatherPhone: 'رقم هاتف الأب',
    motherPhone: 'رقم هاتف الأم',
    parentPhonePlaceholder: 'اختياري',
    /** Wizard controls. `back` never submits and never validates — it only
     *  moves; a student correcting an earlier answer must not be blocked by
     *  an error on the step they are leaving. */
    next: 'التالي',
    back: 'السابق',
    /** The visible position is carried by the step title and the segmented
     *  bar. This is the bar's accessible name — assistive tech reads the
     *  position off `aria-valuenow`/`aria-valuemax`, so no interpolated
     *  "step 2 of 4" string has to exist in two places. */
    progressLabel: 'تقدّمك في تكميل البيانات',
    skip: 'سيبها دلوقتي',
    skipHint: 'هنفكّرك بيها بعدين',
    undoSkip: 'رجّع الحقول',
    submit: 'احفظ وكمّل',
    submitPending: 'جارٍ الحفظ…',
    submitError: 'مقدرناش نحفظ بياناتك. راجعها وحاول تاني.',
    phoneConflictError: 'الرقم ده متسجّل على حساب تاني',
  },
  auth: {
    login: {
      title: 'تسجيل الدخول',
      subtitle: 'كمّل من المكان اللي وقفت فيه.',
      /**
       * Shown above the form ONLY when a validated `?next=` is present — i.e.
       * the visitor was sent here by the gate rather than arriving on their
       * own. It answers the question a bounced visitor is actually asking
       * ("why am I on a login page?"), and its absence for a direct visit is
       * the point: nobody who chose to sign in needs to be told to.
       */
      continueNotice: 'سجّل دخول عشان تكمل',
    },
    register: {
      title: 'اعمل حسابك',
      subtitle: 'دقيقة واحدة وتكون جوه أول محاضرة.',
    },
    fields: {
      name: 'الاسم الكامل',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      confirmPassword: 'تأكيد كلمة المرور',
    },
    actions: {
      login: 'دخول',
      loginPending: 'بندخّلك…',
      register: 'اعمل الحساب',
      registerPending: 'بنجهّز حسابك…',
    },
    switch: {
      noAccount: 'لسه معملتش حساب؟',
      createAccount: 'اعمل واحد دلوقتي',
      haveAccount: 'عندك حساب؟',
      login: 'ادخل من هنا',
    },
    providers: {
      divider: 'أو',
      google: 'كمّل بحساب جوجل',
    },
    /** The dark showcase panel beside the form on /login and /register. */
    aside: {
      eyebrow: 'منصة أ. أيمن أبو العلا',
      title: 'حسابك هو مكان مذاكرتك كله',
      body: 'الكورسات، الدروس اللي خلّصتها، درجاتك في كل اختبار، والمكان اللي وقفت فيه آخر مرة — كله بيستناك جوه.',
      point1: 'كل كورساتك في صفحة واحدة',
      point2: 'المشغّل بيفتكر آخر ثانية وقفت عندها',
      point3: 'كل درجاتك ومراجعاتك متسجّلة',
      codeCaption: 'welcome.js',
    },
    errors: {
      // One generic message per form, shown for EVERY failure reason on that
      // form (wrong password, unknown email, locked account, network error,
      // provider error). Never distinguish the cause in the UI — S1 requires
      // the login endpoint's responses to already be byte-identical across
      // failure modes, and a "helpful" UI message would quietly undo that by
      // reintroducing an enumeration signal one layer up.
      login: 'البريد أو كلمة المرور مش مظبوطين',
      register: 'مقدرناش نعمل الحساب. راجع البيانات وحاول تاني.',
    },
  },
  common: {
    loading: 'ثانية واحدة…',
    error: 'حصلت مشكلة',
    retry: 'حاول تاني',
    empty: 'مفيش حاجة هنا لسه',
    // Plan 6 append.
    undo: 'تراجع',
  },
  /**
   * Cross-cutting accessibility strings that belong to no single feature —
   * a live region's accessible NAME, not its announced content. Kept in its
   * own namespace (audit findings B5/M5) so it never collides with a
   * feature-scoped copy edit landing in the same file at the same time.
   */
  a11y: {
    toastRegionLabel: 'الإشعارات',
    skipToContent: 'تخطَّ إلى المحتوى',
    decorative: 'عنصر زخرفي',
  },
  /**
   * The offline page — the ONLY screen the service worker is allowed to serve
   * from the cache, which is why its wording has to survive being shown at a
   * moment nobody chose. It says what happened, that nothing was lost, and
   * what to do; it does not apologise, and it does not promise the lesson is
   * waiting offline, because it is not (see `public/sw.js`).
   */
  offline: {
    title: 'مفيش نت دلوقتي',
    body: 'الصفحة دي محتاجة اتصال. تقدر ترجع تحاول أول ما النت يرجع — مفيش حاجة ضاعت.',
    retry: 'حاول تاني',
    home: 'الصفحة الرئيسية',
  },
  code: {
    copy: 'انسخ الكود',
    copied: 'اتنسخ',
    label: 'مثال كود',
  },
  showpiece: {
    posterAlt: 'مجسّم ثلاثي الأبعاد بخطوط شبكية يدور ببطء',
    heading: 'الشكل اللي بنبني بيه',
  },
  settings: {
    devices: {
      title: 'أجهزتي',
      subtitle: 'الأجهزة اللي حسابك مفتوح عليها دلوقتي. لو فيه جهاز مش بتاعك، اقفله من هنا.',
      current: 'الجهاز الحالي',
      loggedInAt: 'دخل في',
      lastSeenAt: 'آخر نشاط',
      revoke: 'اقفل الجهاز',
      revokePending: 'جارٍ القفل…',
      revokeCurrentConfirm: 'ده الجهاز اللي إنت عليه دلوقتي — لو قفلته هيتسجّل خروجك فورًا. تمام؟',
      revokeError: 'مقدرناش نقفل الجهاز. حاول تاني.',
      empty: 'مفيش أجهزة مفتوحة دلوقتي',
    },
  },
  home: {
    eyebrow: '01 / المنصة',
  },
  landing: {
    heroEyebrow: 'البكالوريا المصرية · البرمجة وعلوم الحاسب',
    heroLine1: 'من أول سطر كود',
    heroLine2: 'لحد آخر سؤال في الامتحان.',
    /** The hero's second line cycles through these. `heroLine2` stays as the
     *  first entry and as the static fallback under reduced motion. */
    heroRotating: [
      'لحد آخر سؤال في الامتحان.',
      'لحد ما الفكرة تبقى بديهية.',
      'لحد أول مشروع تكتبه لوحدك.',
      'لحد ما تبطّل تحفظ خالص.',
    ],
    heroLead:
      'منهج البرمجة وعلوم الحاسب كامل، ماشي بترتيب واحد ثابت: تفهم الفكرة، تكتبها كود بنفسك، وتتمتحن عليها في نفس الجلسة.',
    ctaPrimary: 'افتح حسابك مجانًا',
    ctaSecondary: 'شوف الكورسات الأول',
    // The signature code sample that types itself in the hero.
    codeCaption: 'محاضرة ٠٤ · الدوال',
    statStudents: '+١٤٠٠',
    statStudentsLabel: 'طالب مشي في المنهج معانا',
    statHours: '+١٧',
    statHoursLabel: 'ساعة شرح متسجّلة',
    statProjects: '+٣',
    statProjectsLabel: 'مشاريع بتبنيها بنفسك',
    statRating: '٤٫٩/٥',
    statRatingLabel: 'متوسط تقييم الطلبة',
    aiEyebrow: 'تحت الغطا',
    aiTitle: 'اللي بيسمّوه ذكاء… أوله عُقدة ووزن',
    aiLead:
      'الشبكة العصبية اللي شغّالة ورا أي نموذج ذكاء اصطناعي مش أكتر من عُقد وأوزان بتتظبط بالتكرار. نفس المنطق ده بالظبط هتكتبه بإيدك في الكورس، سطر ورا سطر.',
    tracksEyebrow: '02 / المنهج',
    tracksTitle: 'مربوط بالمنهج، سؤال بسؤال',
    tracksLead:
      'كل درس معلّق على مكانه في نظام البكالوريا: صفّه ومساره ومادته. يعني بتذاكر اللي بيتسأل عليه فعلًا، مش اللي حواليه.',
    featuresEyebrow: '03 / الطريقة',
    featuresTitle: 'إحنا بنشتغل إزاي',
    feature1Title: 'كل فكرة على اللي قبلها',
    feature1Body: 'مفيش قفزات. المفهوم الجديد بيتبني على اللي فهمته قبله، بأمثلة كود شغّالة قدامك.',
    feature2Title: 'تصحيح في نفس اللحظة',
    feature2Body: 'تعرف غلطك وإنت لسه فاكر السؤال، ومعاه مراجعة بتوضّح الإجابة الصح وسببها.',
    feature3Title: 'تقدّمك متسجّل لوحده',
    feature3Body: 'كل درس بتقفله بيتحفظ، فتعرف وصلت فين ومحتاج ترجع لفين من غير ما تفتكر.',
    instructorEyebrow: '04 / المُحاضر',
    instructorTitle: 'مين اللي واقف قدام الكاميرا',
    instructorName: 'أ. أيمن أبو العلا',
    instructorBody:
      'مهندس بيدرّس البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية. شغله إنه يفكّك الفكرة الصعبة لأجزاء صغيرة، ويخلّيك كاتب كود من أول محاضرة.',
    finalTitle: 'تبدأ إمتى؟',
    finalLead: 'الحساب بياخد دقيقة، وأول محاضرة مفتوحة قدامك على طول ومن غير فلوس.',
    finalCta: 'ابدأ دلوقتي',

    // tracks (code-editor cards, one per track)
    tracksSelectEyebrow: 'المسارات',
    tracksSelectTitle: 'ابدأ من المكان الصح',
    tracksSelectLead: 'مبتدئ خالص ولا بتذاكر منهجك؟ الاتنين ليهم مسار مستنيك.',
    trackEssentialsTag: 'تمهيد · ESSENTIALS',
    trackEssentialsTitle: 'التأسيس',
    trackEssentialsBody: 'المصطلحات والأفكار اللي بتتكرر في أي لغة برمجة، في جلسة واحدة قصيرة.',
    trackEssentialsCta: 'ابدأ من هنا',
    trackYear1Tag: 'المسار · 01',
    trackYear1Title: 'الصف الأول',
    trackYear1Body: 'كورسات أولى بكالوريا: شرح المنهج، تمارين، ومراجعة قبل كل امتحان.',
    trackYear1Cta: 'افتح كورسات أولى',
    trackYear2Tag: 'المسار · 02 — نشط',
    trackYear2Title: 'الصف الثاني',
    trackYear2Body: 'كورسات تانية بكالوريا: شرح المنهج، تمارين، ومراجعة قبل كل امتحان.',
    trackYear2Cta: 'افتح كورسات تانية',

    // courses teaser
    coursesEyebrow: 'المكتبة',
    coursesTitle: 'ابدأ بكورس النهارده',
    coursesLead: 'كل كورس فيه شرح مسجّل، تمارين، واختبارات — مرتّب بالصف والمسار.',
    coursesCta: 'كل الكورسات',
    courseFree: 'مجاني بالكامل',
    courseOpen: 'ادخل الكورس',

    // FAQ
    faqEyebrow: 'أسئلة متكررة',
    faqTitle: 'اللي بيتسأل قبل التسجيل',
    faq1Q: 'مش عارف حاجة عن البرمجة خالص — أبدأ منين؟',
    faq1A: 'من مسار التأسيس. بيشرحلك المصطلحات والأفكار الأساسية الأول، وبعدين تدخل على الكود بتمارين صغيرة بتكبر معاك.',
    faq2Q: 'هتفرّج بس ولا هكتب بإيدي؟',
    faq2A: 'هتكتب من أول محاضرة. كل جزئية وراها تمرين، وفيه محرّر شغّال جوه المنصة تجرّب فيه من غير ما تنزّل أي برنامج.',
    faq3Q: 'أعرف إزاي إني فاهم فعلًا؟',
    faq3A: 'كل درس وراه اختبار قصير بيتصحّح فورًا، ونتايجك كلها بتتجمّع في صفحتك عشان تشوف مستواك ماشي فين.',
    faq4Q: 'المنصة دي لمين بالظبط؟',
    faq4A: 'لطلبة البكالوريا المصرية اللي بياخدوا البرمجة وعلوم الحاسب — من اللي لسه بيبدأ لحد اللي بيجهّز للامتحان النهائي.',
    faq5Q: 'لو حصلت مشكلة في حسابي؟',
    faq5A: 'كلّمنا على واتساب أو من صفحة التواصل، والرد بيوصلك في نفس اليوم.',

    // interactive playground
    playEyebrow: 'محرّر مباشر',
    playTitle: 'اكتب هنا. شغّل. شوف.',
    playLead: 'المحرّر ده شغّال جوه الصفحة من غير أي تنصيب. عدّل في المثال، دوس شغّل، والنتيجة أو رسالة الخطأ هتطلعلك تحت على طول.',
    playRun: 'شغّل الكود',
    playRunning: 'بيشتغل…',
    playReset: 'رجّع المثال',
    playConsole: 'Console — النتيجة',
    playEmpty: 'اكتب كود واضغط «شغّل الكود» — النتيجة هتطلع هنا.',
    playTimeout: 'الكود قعد كتير — غالبًا فيه حلقة مالهاش نهاية.',

    // footer
    footerTagline: 'البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية',
    footerRights: 'جميع الحقوق محفوظة © 2026',
    footerPages: 'الصفحات',
    footerHome: 'الرئيسية',
    footerRegister: 'إنشاء حساب',
    footerLogin: 'تسجيل الدخول',
    footerFollow: 'تابعنا',
    footerContact: 'تواصل معنا',
    footerCommunity: 'مجتمع الطلاب',
    footerYoutube: 'يوتيوب',
    footerInstagram: 'إنستجرام',
    footerTiktok: 'تيك توك',
    footerFacebook: 'فيسبوك',
    footerWhatsappChannel: 'قناة واتساب',
    footerFacebookGroup: 'جروب فيسبوك',
    footerWhatsapp: 'تواصل معنا عبر واتساب',

    // ---- "why learn here" — the two-column vertical marquee ----
    whyTitle: 'ليه تتعلم البرمجة مع',
    whyTitleAccent: 'المهندس أيمن؟',
    whyLead: 'كل حاجة هنا مبنية على إنك تجرّب بنفسك. التفرّج لوحده مش بيعلّم برمجة.',
    whyLeadSecondary:
      'ودروسك وتمارينك ونتايجك كلها في مكان واحد، ماشية معاك خطوة ورا خطوة لحد المشروع الأخير.',
    whyListLabel: 'مميزات التعلم على المنصة',
    why1Title: 'من الصفر فعلًا',
    why1Body: 'مش مطلوب منك أي خلفية سابقة — أول محاضرة بتبدأ من أول مصطلح.',
    why2Title: 'كود من أول يوم',
    why2Body: 'هتكتب وتشغّل بنفسك من أول درس، مش تستنى لحد ما «تخلّص أساسيات».',
    why3Title: 'تمرين ورا كل فكرة',
    why3Body: 'كل جزئية وراها تدريب صغير بيثبّتها قبل ما تعدّي للي بعدها.',
    why4Title: 'مستواك قدامك',
    why4Body: 'اختبارات دورية ونتايج متجمّعة بتقولك إنت قوي فين وضعيف فين.',
    why5Title: 'مشروع بيتبني معاك',
    why5Body: 'تخرج من الكورس ومعاك مشروع شغّال بنيته إنت خطوة بخطوة.',
    why6Title: 'مراجعة قبل الامتحان',
    why6Body: 'مراجعة منظّمة لامتحانات الشهور والنهائي، بنفس أسلوب الأسئلة.',
    why7Title: 'على المنهج بالظبط',
    why7Body: 'كل درس معلّم بصفّه ومساره في نظام البكالوريا، فمفيش وقت ضايع.',
    why8Title: 'الفهم الأول',
    why8Body: 'تعرف الفكرة جت منين وليه، وبعد كده تكتبها كود من دماغك.',

    // ---- tracks / choose your year ----
    tracksSelectBadge: 'SELECT YOUR TRACK',

    // ---- interactive code lab ----
    playFile: 'playground.js',
    playLang: 'JS',
    playEditorLabel: 'editor',
    playExampleLabel: 'اختر مثال',
    playHint: '⌘ / Ctrl + Enter',
    playClear: 'امسح النتيجة',
    playCopy: 'انسخ الكود',
    playCopied: 'اتنسخ ✓',
    playConsoleIdle: 'جاهز',
    playConsoleLines: 'سطر',
    playConsoleErrors: 'خطأ',
    playConsoleClear: 'امسح',
    playExampleStart: 'البداية',
    playExampleVars: 'المتغيرات',
    playExampleConditions: 'الشروط',
    playExampleLoops: 'الحلقات',
    playExampleFunctions: 'الدوال',
    playExampleArrays: 'المصفوفات',
    playExampleErrors: 'الأخطاء',
    playEditorAria: 'محرّر الكود',
    playWorkerError: 'حصل خطأ أثناء التشغيل',
    playUnavailable: 'مش قادرين نشغّل الكود دلوقتي',
    playNoOutput: 'تمام — الكود اشتغل من غير أي ناتج.',

    // ---- the instructor's profile card ----
    profileTier: 'المنصة الرسمية',
    profileRole: 'مدرس البرمجة وعلوم الحاسب — البكالوريا المصرية',
    profileCoursesLabel: 'كورس',
    profileStudentsLabel: 'طالب',
    profileHoursLabel: 'ساعة شرح',
    profileCta: 'كل الكورسات',
    profileSecondary: 'عن المهندس',
    profileAll: 'الكل',
    profileYear: 'الصف',
    profileEmpty: 'مفيش كورسات في الصف ده لسه.',

    // ---- about the instructor ----
    aboutTitle: 'مين أيمن أبو العلا؟',
    aboutBody1:
      'مهندس بيدرّس البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية — أونلاين ومن السنتر.',
    aboutBody2:
      'بيشتغل على الفهم قبل الحفظ: كود من أول حصة، تمرين على كل فكرة، واختبارات بتقيس مستواك أول بأول لحد ما تطلع بمشروع كامل من عندك.',
    /**
     * The CLAIM. `aboutCredits` below is the evidence for it — the paragraph
     * says what makes him different, the rail proves it, and neither repeats
     * the other. Read them together before editing either.
     */
    aboutBody3:
      'ومش مدرّس وبس: مهندس برمجيات شغّال في السوق من سنين، فنفس الكود اللي بيتكتب في الشغل هو اللي بيتشرح في الحصة.',
    aboutRole: 'مدرس البرمجة وعلوم الحاسب — المرحلة الثانوية',

    /**
     * The résumé rail — three answers to «مين أيمن أبو العلا؟», which is why
     * every label is itself a question. The order is his career's: studied,
     * taught, worked.
     *
     * ⚠️ EVERY LINE HERE IS A FACT ABOUT A REAL PERSON, given by him. Nothing
     * in this array may be embellished to make the section read better — the
     * same rule the `/about` page's header comment states, and the reason the
     * marks below are ORGANISATION NAMES rather than claims of endorsement.
     *
     * Each `mark` is an emblem tile. `id` keys `credentialLogos` in
     * `apps/web/lib/brand-assets.ts` — drop a real logo file in there and the
     * tile renders it; until then it renders `short` as a monogram in the
     * platform's own type, which is why every `short` has to READ as a mark on
     * its own rather than as an abbreviation waiting to be expanded.
     *
     * ⚠️ The monogram is the deliberate default, not a gap to be closed with
     * the first logo found on a search. Only files the instructor supplies —
     * his university's, his employers' — belong in that registry. A row of six
     * lifted trademarks would both imply relationships that do not exist (he
     * taught students who BELONG to those companies' student communities; he
     * was not employed by Google, Microsoft or IEEE) and out-shout every other
     * thing on the page.
     */
    aboutCredits: [
      {
        label: 'درس فين؟',
        marks: [{ id: 'mti', name: 'MTI', short: 'MTI' }],
        note: 'كلية الحاسبات والمعلومات — الجامعة الحديثة للتكنولوجيا والمعلومات. اتخرّج مهندس، وبيدرّس النهارده نفس اللي درسه.',
      },
      {
        label: 'درّس لمين؟',
        marks: [
          { id: 'google', name: 'Google', short: 'G' },
          { id: 'microsoft', name: 'Microsoft', short: 'MS' },
          // The full four letters, not `IE` — IEEE is never written short, and
          // `IE` reads as a decade-dead browser.
          { id: 'ieee', name: 'IEEE', short: 'IEEE' },
        ],
        note: 'طلبة ثانوي وطلبة جامعة، أونلاين ومن السنتر — أساسيات البرمجة وتراك تطبيقات الموبايل. ومن طلبته أعضاء في المجتمعات الطلابية للجهات دي.',
      },
      {
        label: 'اشتغل فين؟',
        marks: [
          { id: 'ccr', name: 'CCR', short: 'CCR' },
          { id: 'avnology', name: 'Avnology', short: 'AV' },
        ],
        // The tiles already say CCR and Avnology; the note says what he DID at
        // each, in the same order, and repeating the names here would just cost
        // a line of wrapping.
        note: 'مهندس برمجيات أول لتطبيقات الموبايل في مصر، ومهندس برمجيات في السعودية.',
      },
    ],

    // ── the dedicated /about page ────────────────────────────────────────
    /**
     * The landing page's about SECTION and this page share their body copy
     * (`aboutBody1`/`aboutBody2` above) — one set of facts about a real
     * person, edited in one place. Only the framing differs: the section
     * introduces him mid-scroll to someone reading about the platform, the
     * page answers a search for his NAME, so its heading is the name itself
     * rather than a question about it.
     */
    aboutPageTitle: 'أيمن أبو العلا',
    aboutPageLead: 'مدرّس البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية.',
    aboutPageDescription:
      'مين أيمن أبو العلا؟ مهندس بيدرّس البرمجة وعلوم الحاسب لطلبة نظام البكالوريا المصرية — أونلاين ومن السنتر، بشرح بالكود وتمرين على كل درس واختبارات بتقيس مستواك أول بأول.',
    aboutPageCoursesTitle: 'بيدرّس إيه',
    aboutPageCta: 'اتفرّج على الكورسات',
    aboutChip1: 'شرح بالكود',
    aboutChip2: 'تمرين على كل درس',
    aboutChip3: 'اختبارات ومتابعة',

    // ---- extra FAQ rows ----
    faq6Q: 'أذاكر إزاي هنا؟',
    faq6A: 'تختار كورس صفّك وتمشي بالترتيب: فيديو، وبعده تمرين، وبعده اختبار قصير. الدرس ما بيتقفلش غير لما تخلّص التلاتة.',
    faq7Q: 'هطلع من الكورس عارف إيه؟',
    faq7A: 'المتغيرات والدوال والشروط والحلقات والمصفوفات، وبعدين تطبيق على منهج صفّك لحد ما تبني مشروع كامل شغّال.',
  },
  years: {
    title: 'كورسات',
    year1: 'الصف الأول بكالوريا',
    year2: 'الصف الثاني بكالوريا',
    year3: 'الصف الثالث بكالوريا',
    filterAll: 'الكل',
    filterFree: 'المجاني بس',
    empty: 'لسه مفيش كورسات منشورة للصف ده.',
  },
  essentials: {
    badge: 'WARM-UP',
    title: 'قبل أول سطر كود',
    leadBefore: 'المصطلحات اللي بتتكرر في أي لغة برمجة، كل واحد منهم في سطرين. تخلّصهم وتبقى',
    leadCode: 'ready = true',
    leadAfter: 'بجد.',
    cta: 'اختار صفّك',
    listTitle: '١٢ مصطلح مش هتعرف تكمّل من غيرهم',
    listLead: 'تعريف واحد واضح لكل مصطلح — بالعربي، ومعاه اسمه بالإنجليزي زي ما هتلاقيه في أي كود.',
    t1Ar: 'متغيّر',
    t1Body: 'اسم بتحطّ فيه قيمة عشان تستخدمها بعدين، وتقدر تغيّرها في أي وقت.',
    t2Ar: 'دالة',
    t2Body: 'شغل مكتوب مرة واحدة تحت اسم، وبتناديه كل ما تحتاجه بدل ما تعيده.',
    t3Ar: 'حلقة',
    t3Body: 'بتخلّي الكمبيوتر يكرّر نفس الخطوات لحد ما شرط معيّن يقف.',
    t4Ar: 'مصفوفة',
    t4Body: 'صف من القيم ورا بعض، كل واحدة ليها رقم مكانها تنادي بيه عليها.',
    t5Ar: 'شرط',
    t5Body: 'مفترق طرق في الكود: لو ده صح روح هنا، وغير كده روح هناك.',
    t6Ar: 'كائن',
    t6Body: 'حاجة ليها صفات وأفعال، وبياناتها كلها متجمّعة في مكان واحد.',
    t7Ar: 'نوع البيانات',
    t7Body: 'القيمة دي رقم ولا نص ولا صح/غلط — النوع بيحدّد إيه اللي ينفع تعمله بيها.',
    t8Ar: 'مُعامل',
    t8Body: 'العلامات اللي بتشتغل على القيم: جمع وطرح ومقارنة ومنطق.',
    t9Ar: 'خطأ',
    t9Body: 'رسالة بتقولك إيه اللي وقف وفين بالظبط. دي أسرع طريقة تتعلم بيها.',
    t10Ar: 'تعليق',
    t10Body: 'سطر مكتوب للبني آدم مش للكمبيوتر، بيفكّرك إنت عملت كده ليه.',
    t11Ar: 'مُدخل ومُخرج',
    t11Body: 'الكود بياخد بيانات من برّه، وبيرجّع نتيجة تظهرلك على الشاشة.',
    t12Ar: 'خوارزمية',
    t12Body: 'ترتيب الخطوات اللي بيحل المسألة — الفكرة نفسها قبل ما تتحوّل لكود.',

    // ── the in-shell version (/foundations) ──────────────────────────────
    /**
     * The signed-in student reads the SAME twelve definitions, but arrives
     * for a different reason: not "should I learn this" but "what was a loop
     * again". Hence a lookup framing and no «اختار صفّك» — they chose one.
     */
    appEyebrow: '05 / التأسيس',
    appTitle: 'التأسيس',
    appSubtitle: 'المصطلحات اللي بتتكرر في أي لغة برمجة — ارجعلها في أي وقت.',
    appSearch: 'دوّر على مصطلح',
    appNoMatch: 'مفيش مصطلح بالاسم ده.',
  },
  catalog: {
    eyebrow: '03 / الكورسات',
    title: 'الكورسات',
    subtitle: 'كل محاضرات البرمجة وعلوم الحاسب، مرتّبة بالصف والمسار',
    empty: 'لسه مفيش كورسات منشورة',
    lessonCount: 'محاضرة',
    duration: 'المدة',
    minutes: 'دقيقة',
    hours: 'ساعة',
    freePreview: 'معاينة مجانية',
    free: 'مجاني',
    open: 'افتح الكورس',
  },
  /**
   * `/library` — the SIGNED-IN student's shelf, inside the app shell.
   *
   * Deliberately a separate namespace from `catalog`, which is the PUBLIC
   * `/courses` page. The two answer different questions and must be allowed to
   * word themselves differently: the public page sells ("كل محاضرات البرمجة"),
   * this one orients someone who is already inside ("كورساتك", "باقي الصفوف").
   * Sharing one namespace is how a marketing sentence ends up on a dashboard.
   */
  library: {
    eyebrow: '04 / الكورسات',
    title: 'الكورسات',
    subtitle: 'كل الكورسات المنشورة، مرتّبة بالصف والمسار — وكورساتك إنت في الأول.',

    // ── the identity strip ───────────────────────────────────────────────
    /** `{year}` is e.g. «الصف الثاني بكالوريا», `{track}` e.g. «لغات». */
    identity: '{year} · {track}',
    identityLabel: 'صفّك ومسارك',
    identityEdit: 'غيّرهم',
    identityMissing: 'لسه ماخترتش صفّك',
    identityMissingHint: 'اختار صفّك ومسارك عشان نعرف نرتّب كورساتك.',
    identityMissingCta: 'اختار صفّك',
    /** Used when a course belongs to a year but to no particular track. */
    trackGeneral: 'عام',

    // ── the groups ───────────────────────────────────────────────────────
    yoursTitle: 'كورساتك',
    yoursLead: 'الكورسات اللي على صفّك ومسارك.',
    yoursEmpty: 'لسه مفيش كورسات منشورة لصفّك. أول ما ينزل كورس هيظهر هنا.',
    restTitle: 'باقي الصفوف',
    restLead: 'مفتوحة لك تتفرّج عليها في أي وقت.',
    empty: 'لسه مفيش كورسات منشورة.',
    /** `{n}` is a course count. */
    courseCount: '{n} كورس',

    // ── a course card ────────────────────────────────────────────────────
    /** `{n}` is a lesson count. */
    lessonCount: '{n} محاضرة',
    percentDone: 'خلصت {percent}%',
    notStarted: 'لسه ماابتديتش',
    courseDone: 'خلصت الكورس',
    start: 'ابدأ الكورس',
    resume: 'كمّل',
    open: 'افتح الكورس',

    // ── the course page (/library/[slug]) ────────────────────────────────
    backToLibrary: 'كل الكورسات',
    outline: 'محتوى الكورس',
    /** `{n}` is the lesson's place in the WHOLE course, not in its section. */
    lessonIndex: 'المحاضرة {n}',
    watch: 'مشاهدة',
    takeQuiz: 'امتحن',
    review: 'راجع',
    reread: 'راجع الدرس',
    lessonDone: 'خلصت',
    lessonLocked: 'مقفول',
    exam: 'الامتحان النهائي',
    notEnrolledTitle: 'ابدأ الكورس عشان تفتح المحاضرات',
    notEnrolledBody: 'الكورس مجاني بالكامل — اضغط ابدأ وهتفتح لك أول محاضرة على طول.',
    enrollCta: 'ابدأ الكورس',

    // ── the locked-lesson dialog ─────────────────────────────────────────
    lockedTitle: 'المحاضرة دي لسه مقفولة',
    /** `{lesson}` is the exact lesson standing in the way, by name. */
    lockedBecause: 'عشان تفتحها، لازم تخلّص «{lesson}» الأول.',
    lockedBecauseQuiz: 'عشان تفتحها، لازم تنجح في «{lesson}» الأول.',
    lockedExam: 'الامتحان النهائي بيفتح لما تخلّص كل محاضرات الكورس.',
    lockedGeneric: 'خلّص المحاضرة اللي قبلها الأول وهتفتح لك على طول.',
    lockedGo: 'روح للمطلوب',
    lockedClose: 'تمام',
  },
  /** `/settings/section` — changing the year/track after onboarding. */
  section: {
    eyebrow: 'الإعدادات',
    title: 'صفّك ومسارك',
    subtitle: 'غيّرهم في أي وقت — الكورسات اللي تظهرلك بتتغيّر معاهم.',
    save: 'احفظ',
    saving: 'جارٍ الحفظ…',
    saveFailed: 'مقدرناش نحفظ التغيير. راجع اختياراتك وحاول تاني.',
    /**
     * The one dead end this form can reach: بكالوريا year 2 requires an
     * elective, but the elective select only appears once a track is chosen —
     * so the blocking error lands on a field that is not on screen. Naming the
     * field the student CAN act on is the difference between a form that
     * explains itself and one that silently refuses to submit.
     */
    pickTrackFirst: 'اختار المسار الأول عشان تقدر تختار المادة الاختيارية.',
    /**
     * The reassurance a student needs before touching this. Changing section
     * writes four columns and nothing else — see `updateSection` in the API.
     */
    keepsProgress:
      'تقدمك محفوظ. لو رجعت لصفّك القديم هتلاقي كل اللي خلّصته ودرجاتك زي ما هي.',
    back: 'رجوع للكورسات',
  },
  /**
   * `/playground` — the signed-in student's scratchpad.
   *
   * Deliberately separate from `copy.landing.play*`, which words the SAME
   * evaluator as a marketing demo ("اكتب هنا. شغّل. شوف."). This one talks to
   * someone who is already studying and wants to try something out.
   */
  playground: {
    eyebrow: '06 / التجربة',
    title: 'جرّب الكود',
    subtitle: 'اكتب كود وشغّله على طول. مافيش حاجة بتتحفظ ولا بتتصحّح — المكان ده للتجريب.',
    editorLabel: 'محرّر الكود',
    run: 'شغّل',
    running: 'بيشتغل…',
    reset: 'رجّع المثال',
    copy: 'انسخ',
    copied: 'اتنسخ',
    output: 'النتيجة',
    outputEmpty: 'اضغط «شغّل» وهتلاقي النتيجة هنا.',
    /** `{n}` is a line count. */
    lines: '{n} سطر',
    examplesLabel: 'أمثلة جاهزة',
    /** The language the runner actually executes. Shown, never chosen — see
     *  the page's own note on why there is no picker yet. */
    tipsTitle: 'حاجات تجرّبها',

    // ── اللغة ────────────────────────────────────────────────────────────
    languageLabel: 'اللغة',
    js: 'JavaScript',
    python: 'Python',
    /**
     * The interpreter is 13.5 MB. On Egyptian mobile data that is a real cost,
     * so it is never pulled without the student pressing something — this is
     * that button, and it says the size out loud rather than hiding it.
     */
    pythonLoad: 'حمّل البايثون (١٣ ميجا)',
    pythonLoading: 'بيحمّل البايثون… أول مرة بس',
    pythonReady: 'البايثون جاهزة',
    pythonNote:
      'البايثون بتشتغل جوّه المتصفّح عندك — مافيش كود بيتبعت لأي سيرفر. أول تحميل ١٣ ميجا وبعدها بيتخزّن.',
    pythonUnavailable: 'مقدرناش نشغّل البايثون على المتصفّح ده.',
    pythonNoPackages: 'المكتبات الخارجية زي numpy مش متاحة هنا — بايثون الأساسية بس.',
    resetRuntime: 'ابدأ من نضيف',
    timeout: 'الكود أخد وقت طويل واتوقف. غالبًا فيه حلقة مالهاش نهاية.',
  },
  course: {
    back: 'رجوع',
    lessons: 'الدروس',
    freeBanner: 'الكورس ده مفتوح مجانًا',
    lessonsLabel: 'الدروس:',
    watch: 'اتفرّج',
    takeQuiz: 'ادخل الاختبار',
    breadcrumbHome: 'الرئيسية',
    breadcrumbCatalog: 'الكورسات',
    content: 'محتوى الكورس',
    about: 'عن الكورس',
    instructor: 'المُحاضر',
    start: 'ابدأ الكورس',
    continue: 'كمّل الكورس',
    enrolled: 'إنت مشترك في الكورس ده',
    notFound: 'الكورس ده مش موجود',
    /**
     * The locked panel that replaced the free-preview player on the public
     * course page. Deliberately does NOT say "سجّل دخول" — the page is cached
     * for every visitor alike and cannot know whether this one is signed in
     * (design §5), so the copy states the rule rather than addressing a state
     * it cannot read.
     *
     * ⚠️ NOTHING RENDERS THIS ANY MORE, and that is deliberate. It asserted a
     * locked state to a student who was already signed in and already enrolled
     * — the complaint that started this work — and `startNote` below is what
     * that panel says instead.
     *
     * It is kept, unrendered, for exactly one consumer:
     * `apps/web/e2e/student-course-entry.e2e.ts` asserts `toHaveCount(0)` on
     * it. That is the regression guard — the test proves the lock message is
     * ABSENT from the page a student lands on — and it cannot be written
     * without the string. Delete this key and that assertion goes with it.
     */
    lockedNote: 'الدروس بتفتح أول ما تدخل بحسابك',
    /**
     * The note under the play frame on the public course page.
     *
     * Same cache constraint as `lockedNote` — one HTML document for every
     * visitor, so it still cannot address a session it cannot read. The
     * difference is what it does with that: `lockedNote` announced a lock,
     * this describes what the button will do in EITHER case. It is true for a
     * signed-in student and true for a stranger, which is the only kind of
     * sentence a cached page is allowed to say about state.
     */
    startNote: 'اضغط شغّل — لو داخل بحسابك هتتفرّج على طول، ولو لسه هنسجّلك الأول.',
    /**
     * The play control laid over the course cover.
     *
     * Its accessible name is this string with the course title appended, built
     * at the call site — never a separate `playAria` template. There was one,
     * reading «شغّل «{course}»», and because it did not CONTAIN the visible
     * label it failed WCAG 2.5.3: a speech-input user saying «شغّل الكورس»
     * could not press the page's main control. One string, extended, cannot
     * drift from itself.
     */
    playCta: 'شغّل الكورس',
    startPending: 'ثانية واحدة…',
    /** Every failure of the enroll click except 401, which navigates instead. */
    startError: 'مقدرناش نفتح الكورس دلوقتي. حاول تاني.',
    /** A published course whose lessons are not published yet. */
    noLessons: 'لسه مفيش دروس منشورة في الكورس ده',
    lessonKind: {
      video: 'فيديو',
      quiz: 'اختبار',
      attachment: 'مرفق',
      text: 'قراءة',
    },
  },
  player: {
    eyebrow: '09 / المشغّل',
    outline: 'محتوى الكورس',
    previous: 'الدرس السابق',
    next: 'الدرس التالي',
    markComplete: 'خلّصت · التالي',
    markCompleteFinal: 'خلّصت الدرس',
    marking: 'بنسجّل…',
    completed: 'تم',
    inProgress: 'شغّال',
    notStarted: 'لسه',
    play: 'شغّل الفيديو',
    videoUnavailable: 'الفيديو مش متاح دلوقتي',
    resources: 'مواد الدرس',
    mainPresentation: 'البريزنتيشن الأساسي',
    openInNewTab: 'افتح في تبويب جديد',
    viewerUnavailable: 'المتصفح مش قادر يعرض الملف — نزّله وشوفه.',
    noResources: 'مفيش مواد مرفوعة للدرس ده.',
    lockedHint: 'خلّص اللي قبله الأول عشان يتفتح',
    examBadge: 'امتحان',
    examLockedHint: 'الامتحان بيتفتح لما تخلّص كل المحاضرات',
    download: 'تحميل',
    quizIntro: 'الدرس ده اختبار — ابدأ لما تكون جاهز.',
    quizCta: 'ابدأ الاختبار',
    courseProgress: 'تقدّمك في الكورس',
    lessonsCompleted: 'درس خلص من',
    autoCompleteHint: 'الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.',
    manualOnlyHint: 'مدة الفيديو مش متسجّلة، فدوس «خلّصت الدرس» لما تنتهي.',
    saveFailed: 'مقدرناش نسجّل تقدّمك دلوقتي',
  },
  path: {
    eyebrow: '02 / مساري',
    title: 'مسارك التعليمي',
    subtitle: 'كل كورس مفتوح لك، بالترتيب اللي هتذاكر بيه.',
    summary: '{cleared} من {total} محاضرة في {courses} كورس',
    percentComplete: 'خلصت {percent}%',
    startHere: 'ابدأ من هنا',
    courses: 'الكورسات',
    /** `{n}` is the course's 1-based place in the student's run of courses. */
    courseIndex: 'الكورس {n}',
    empty: 'لسه مش مشترك في أي كورس.',
    emptyCta: 'اتفرّج على الكورسات',
    done: 'خلصت',
    locked: 'مقفول',
    exam: 'الامتحان النهائي',
    courseDone: 'الكورس خلص',
    nothingOpen: 'مفيش حاجة مفتوحة دلوقتي',
  },
  dashboard: {
    eyebrow: '01 / حسابي',
    title: 'حسابي',
    continueWatching: 'كمّل من مكانك',
    continueCta: 'كمّل',
    remaining: 'باقي',
    myCourses: 'كورساتي',
    recentScores: 'آخر النتائج',
    noScoresYet: 'أول اختبار تخلّصه هتلاقي درجته هنا.',
    noCoursesYet: 'لسه مامعاكش أي كورس.',
    browseCourses: 'اختار كورس',
    // ── the redesigned dashboard (added, nothing above was renamed) ──────
    /** `{name}` is the student's first name. */
    greeting: 'أهلًا {name}',
    greetingFallback: 'أهلًا بيك',
    subtitle: 'ده مكان مذاكرتك كله — الكورسات، تقدّمك، ودرجاتك.',
    statCourses: 'كورساتك',
    statLessonsDone: 'دروس خلصتها',
    statOverall: 'إجمالي تقدّمك',
    statAverage: 'متوسط درجاتك',
    statNoScores: 'لسه',
    lessonsOf: 'من',
    lessonsWord: 'درس',
    progressLabel: 'التقدّم',
    openCourse: 'افتح الكورس',
    continueCourse: 'كمّل الكورس',
    startCourse: 'ابدأ الكورس',
    courseDone: 'خلّصت الكورس ده',
    emptyTitle: 'ابدأ من كورس',
    emptyBody: 'اختار كورس صفّك ومساره، واشترك فيه، وهيبان هنا على طول مع تقدّمك فيه.',
    scoresAll: 'كل النتائج',
    scoreOn: 'في',
    quickLinks: 'روابط سريعة',
    linkCourses: 'كل الكورسات',
    linkEssentials: 'مسار التأسيس',
    linkDevices: 'أجهزتي',
    // ── slice 1: the rebuilt dashboard ──────────────────────────────────
    /** Sits above the five-bar strip in the scores card. Not "آخر النتائج"
     *  again — the strip and the list are the same five results shown twice,
     *  and repeating the heading reads as two separate datasets. */
    scoresTrend: 'آخر خمس نتائج',
    /** The first-run card. It renders only while a step is outstanding, so
     *  none of this copy is ever seen by a student who is already going. */
    startHereTitle: 'ابدأ من هنا',
    /** `{done}` / `{total}` are step counts, e.g. "خطوة ١ من ٣". */
    startHereProgress: 'خطوة {done} من {total}',
    startHereNote: 'عشر دقايق في اليوم أحسن من ساعة مش هتذاكرها أصلًا.',
    stepEnrollTitle: 'اختار كورس واشترك فيه',
    stepEnrollBody: 'اختار كورس سنتك ومسارك، وهيظهر في قائمتك على طول.',
    stepEnrollCta: 'شوف الكورسات',
    stepLessonTitle: 'افتح أول درس',
    stepLessonBody: 'الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.',
    stepLessonCta: 'افتح الدرس',
    stepQuizTitle: 'حل أول اختبار',
    stepQuizBody: 'كل درس وراه اختبار قصير. درجتك بتظهر هنا على طول بعد ما تسلّم.',
    stepQuizCta: 'روح لمسارك',
    /** Replaces the step's CTA once it is ticked. */
    stepDone: 'تمّت',
  },

  /** Slice 2 — `/results`, the student's own quiz history. */
  results: {
    eyebrow: '03 / نتائجي',
    title: 'نتائجي',
    subtitle: 'كل امتحان دخلته، درجتك فيه، وإزاي بتتحسّن مع الوقت.',
    statQuizzes: 'امتحانات دخلتها',
    statAttempts: 'عدد محاولاتك',
    statAverage: 'متوسط درجاتك',
    statBest: 'أعلى درجة',
    statPassed: 'امتحانات نجحت فيها',
    /** The stat tiles show this instead of a number when nothing is graded. */
    noneYet: 'لسه',
    trendTitle: 'درجاتك مع الوقت',
    /**
     * The chart's visually-hidden description. `{count}` attempts, from
     * `{first}`% to `{last}`% — a sighted student reads the shape, everyone
     * else gets the same fact as a sentence, because a polyline announces
     * nothing.
     */
    trendSummary: 'رسم بياني لـ{count} محاولة، من {first}% لحد {last}%.',
    /** Drawn as a dashed rule across the chart. */
    trendPassLine: 'خط النجاح',
    /**
     * The chart's legend. Pass/fail is drawn as filled-vs-hollow rather than
     * as a second hue — green-vs-orange measures ΔE 6.3 under protanopia — so
     * these two strings ARE the encoding's other half, not decoration.
     */
    trendLegendPassed: 'محاولة عدّيتها',
    trendLegendFailed: 'محاولة ماعدّتش',
    quizzesTitle: 'كل امتحان على حدة',
    best: 'أعلى درجة',
    latest: 'آخر محاولة',
    attemptsUsed: 'محاولاتك',
    /** `{used}` of `{max}`, e.g. "٢ من ٣". */
    attemptsOf: '{used} من {max}',
    attemptsUnlimited: 'من غير حد',
    emptyTitle: 'لسه مدخلتش أي امتحان',
    emptyBody: 'كل درس وراه امتحان قصير. أول ما تخلّص واحد، درجتك ومراجعة إجاباتك هيبانوا هنا.',
    emptyCta: 'روح لمسارك',
  },

  /** Slice 3 — `/profile`. */
  profile: {
    eyebrow: '04 / بروفايلي',
    title: 'بروفايلي',
    subtitle: 'بياناتك، اللي حصّلته، والأجهزة اللي حسابك مفتوح عليها.',
    // ── the photo ──────────────────────────────────────────────────────
    photoTitle: 'صورتك',
    photoHint: 'PNG أو JPG، لحد ٢ ميجا. هنقصّها مربّعة تلقائيًا.',
    photoChange: 'غيّر صورتك',
    photoUploading: 'بنرفع الصورة…',
    photoDone: 'اتغيّرت صورتك',
    photoFailed: 'مقدرناش نرفع الصورة. جرّب صورة تانية.',
    photoTooLarge: 'الصورة أكبر من ٢ ميجا. صغّرها وجرّب تاني.',
    photoWrongType: 'ده مش ملف صورة. اختار PNG أو JPG.',
    // ── identity ───────────────────────────────────────────────────────
    fieldPhone: 'رقم الموبايل',
    fieldSchool: 'المدرسة',
    fieldGovernorate: 'المحافظة',
    fieldYear: 'الصف',
    fieldNotSet: 'مش متسجّل',
    // ── totals ─────────────────────────────────────────────────────────
    earnedTitle: 'اللي حصّلته',
    statLessons: 'دروس خلصتها',
    statWatchTime: 'وقت المذاكرة',
    statQuizzesPassed: 'امتحانات نجحت فيها',
    statAverage: 'متوسط درجاتك',
    noneYet: 'لسه',
    // ── activity ───────────────────────────────────────────────────────
    activityTitle: 'سجل نشاطك',
    activitySubtitle: 'كل حاجة عملتها، بالترتيب.',
    activityEmpty: 'أول ما تفتح درس أو تدخل امتحان هتلاقي الحركة هنا.',
    activityMore: 'شوف أقدم',
    activityLoading: 'بنجيب…',
    activityFailed: 'مقدرناش نجيب باقي السجل. حاول تاني.',
    /** `{duration}` is already formatted, e.g. "١٢ دقيقة". */
    activityWatched: 'شُفت الدرس لمدة {duration}',
    activityCompleted: 'خلّصت الدرس',
    /** How a lesson was completed, appended to `activityCompleted`. */
    activityViaAuto: 'تلقائيًا',
    activityViaManual: 'بنفسك',
    activityViaDwell: 'بعد قراية الدرس',
    /** `{score}` is a percentage. */
    activityQuiz: 'دخلت الامتحان وجبت {score}%',
    activityAttemptNo: 'المحاولة {n}',
    // ── devices ────────────────────────────────────────────────────────
    devicesTitle: 'أجهزتك',
    devicesSubtitle: 'لو فيه جهاز مش بتاعك، اقفله من هنا.',
    // ── charts (added; nothing above renamed) ────────────────────────────
    chartsTitle: 'أرقامك',
    chartsSubtitle: 'درجاتك في كل اختبار خلّصته، ومسارها مع الوقت.',
    scoresTitle: 'درجاتك في كل اختبار',
    scoresBest: 'أحسن محاولة',
    /** Screen-reader text for one bar. `{quiz}` and `{percent}` are filled in. */
    scoresBarLabel: '{quiz}: {percent}٪',
    chartsEmpty: 'أول اختبار تخلّصه هتلاقي درجتك هنا مرسومة.',
  },

  /** Slice 4 — in-app notifications. */
  notifications: {
    eyebrow: '05 / الإشعارات',
    title: 'الإشعارات',
    subtitle: 'كل حاجة حصلت في حسابك وتستاهل تعرفها.',
    /** `aria-label` on the bell. `{n}` is the unread count. */
    bell: 'الإشعارات',
    bellWithUnread: 'الإشعارات — {n} جديدة',
    panelTitle: 'الإشعارات',
    markAllRead: 'علّم الكل كمقروء',
    markingAll: 'بنعلّم…',
    seeAll: 'شوف الكل',
    empty: 'مفيش إشعارات لسه.',
    emptyHint: 'أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.',
    more: 'شوف أقدم',
    loading: 'بنجيب…',
    failed: 'مقدرناش نجيب الإشعارات. حاول تاني.',
    // ── the three kinds ────────────────────────────────────────────────
    /** `{score}` is a percentage. */
    quizGraded: 'اتصحّحت ورقتك — جبت {score}%',
    quizGradedPassed: 'نجحت',
    quizGradedFailed: 'محتاج تحاول تاني',
    appealAccepted: 'تظلّمك اتقبل واتعدّلت درجتك',
    appealRejected: 'تظلّمك اتراجع والدرجة زي ما هي',
    extraAttempt: 'المدرّس دّالك محاولة زيادة في الامتحان ده',
    /** المساعد — the instructor answered a conversation this student opened.
     *  Carries no lesson, which is why `EmitInput` stopped requiring one. */
    conversationReply: 'أيمن ردّ على سؤالك',
    /** Relative time, e.g. "من ٣ ساعات" — `{value}` is already formatted. */
    ago: 'من {value}',
  },
  enrollment: {
    enroll: 'اشترك في الكورس',
    enrolled: 'إنت مشترك',
    enrolling: 'بنشتركك…',
    startCourse: 'ابدأ الكورس',
  },
  /**
   * المساعد — the guided assistant widget and the inbox it feeds.
   *
   * `script` and `choices` are not ordinary copy blocks: their KEYS are the
   * node ids and choice ids of `assistant/script.ts`, and that file types
   * itself against `keyof typeof copy.assistant.script`. So a node with no
   * Arabic text, or Arabic text with no node, is a COMPILE error rather than
   * an empty bubble in production. Adding a branch means editing both, always,
   * in the same commit.
   */
  assistant: {
    // ── the launcher and the panel chrome ──────────────────────────────
    /** `aria-label` on the floating button. */
    open: 'اسأل المساعد',
    openWithReply: 'اسأل المساعد — فيه رد جديد',
    close: 'اقفل المساعد',
    title: 'مساعد المنصة',
    subtitle: 'إجابات سريعة، ولو مالقيتش اللي بتدوّر عليه بوصّلك لأيمن.',
    restart: 'ابدأ من الأول',
    /** Shown above the choice buttons on every node. */
    pick: 'اختار:',
    /** The transcript's label for what the visitor pressed. */
    youPicked: 'إنت اخترت',

    // ── node bodies. Keys ARE the node ids. ────────────────────────────
    script: {
      root: 'أهلاً بيك! أنا هنا أجاوب على أكتر الأسئلة اللي بتتسأل. اختار اللي في بالك:',

      courses: 'تمام. عايز تعرف إيه عن الكورسات؟',
      coursesList: 'دي الكورسات المفتوحة دلوقتي:',
      courseInside:
        'كل كورس متقسّم وحدات، وكل وحدة فيها دروس فيديو ومعاها ملخّص مكتوب وملفات تقدر تحمّلها. بعد كل درس فيه كويز قصير يقيس فهمك، وآخر كل وحدة امتحان شامل.',
      courseStart:
        'الكورس مالوش ميعاد بداية ثابت — أول ما تشترك بيتفتح لك على طول وتمشي بالسرعة اللي تريّحك. اللي بيكون بميعاد هو المراجعات النهائية قبل الامتحانات، ودي بتتعلن على الصفحة الرئيسية وعلى واتساب.',

      join: 'اختار اللي محتاج تعرفه:',
      joinAccount:
        'دوس على إنشاء حساب، وهتكتب اسمك ورقمك ومحافظتك وسنتك الدراسية. الخطوة دي بتاخد دقيقة، وبعدها المنصة بتعرف تورّيك مواد سنتك إنت بالظبط بدل ما تدوّر.',
      joinEnroll:
        'افتح صفحة الكورس اللي عايزه ودوس اشترك في الكورس. لو الكورس متاح لسنتك هيتفتح لك على طول وتلاقيه في لوحتك.',
      joinPrice:
        'الأسعار والعروض بتتغيّر من فترة للتانية، فمش عايز أقولك رقم قديم. أحسن حاجة إني أوصّلك لأيمن يقولك السعر الحالي بالظبط.',

      study: 'قولّي السؤال في إيه:',
      studyQuizzes:
        'الكويزات القصيرة اختيار من متعدد وصح وغلط، وبتتصحّح لحظياً وتشوف نتيجتك على طول. الامتحانات الشاملة ممكن يكون فيها أسئلة مقالية بيصحّحها أيمن بنفسه، ودي بتاخد وقت — وهيوصلك إشعار أول ما تتصحّح.',
      studyRetake:
        'ده بيرجع لإعدادات الامتحان نفسه: فيه امتحانات بتسمح بأكتر من محاولة وفيه محاولة واحدة بس. العدد المسموح مكتوب لك في صفحة الامتحان قبل ما تبدأ. ولو خلّصت محاولاتك ومحتاج واحدة زيادة، أيمن يقدر يديهالك.',
      studyAppeal:
        'لو شايف إن درجتك في سؤال مش مظبوطة، افتح مراجعة المحاولة ودوس تظلّم جنب السؤال نفسه. أيمن بيراجعه بإيده، وهيوصلك إشعار بالنتيجة سواء اتقبل أو اتراجع.',
      studyProgress:
        'كل درس بتخلّصه بيتسجّل لوحده من غير ما تعمل حاجة، ولوحتك بتوريك نسبة كل كورس وآخر درس وقفت عنده عشان تكمّل من نفس المكان.',

      account: 'اختار المشكلة:',
      accountPassword:
        'من صفحة الدخول دوس على نسيت كلمة السر واكتب إيميلك، وهيوصلك لينك تغيّرها منه. لو الرسالة مش بتوصل، بصّ في السبام قبل ما تحاول تاني.',
      accountProfile:
        'من صفحة حسابي تقدر تعدّل اسمك ورقمك ومحافظتك وسنتك الدراسية. خد بالك إن تغيير السنة بيغيّر المواد اللي المنصة بتعرضها لك.',
      accountVideo:
        'جرّب تقفل الصفحة وتفتحها تاني الأول — ده بيحل أغلب الحالات. لو الفيديو لسه واقف، جرّب متصفح تاني أو شبكة تانية. ولو المشكلة مستمرة قولّي وأنا أوصّلك لأيمن ومعاه اسم الدرس.',
    },

    // ── choice labels. Keys ARE the choice ids. ────────────────────────
    choices: {
      back: 'رجوع',
      talk: 'عايز أكلّم أيمن',

      courses: 'الكورسات والمحتوى',
      join: 'الاشتراك والحساب',
      study: 'المذاكرة والامتحانات',
      account: 'مشكلة في حسابي',

      coursesAvailable: 'إيه المتاح دلوقتي؟',
      courseInside: 'الكورس فيه إيه؟',
      courseStart: 'هنبدأ إمتى؟',
      browseCourses: 'اتفرّج على الكورسات',
      essentials: 'أساسيات المادة',

      joinAccount: 'إزاي أعمل حساب؟',
      joinEnroll: 'إزاي أشترك في كورس؟',
      joinPrice: 'الكورس بكام؟',
      register: 'إنشاء حساب',

      studyQuizzes: 'الامتحانات شكلها إيه؟',
      studyRetake: 'أقدر أعيد الامتحان؟',
      studyAppeal: 'درجتي مش مظبوطة',
      studyProgress: 'تقدّمي بيتحسب إزاي؟',
      dashboard: 'روح للوحتي',

      accountPassword: 'نسيت كلمة السر',
      accountProfile: 'عايز أعدّل بياناتي',
      accountVideo: 'الفيديو مش شغّال',
      login: 'صفحة الدخول',
      profile: 'صفحة حسابي',
    },

    // ── the one node that renders live catalog data ────────────────────
    courses: {
      /** `{lessons}` is already formatted as an Arabic numeral. */
      meta: '{subject} · {lessons} درس',
      empty: 'مفيش كورسات مفتوحة في اللحظة دي. لو عايز تعرف أول ما ينزل جديد، كلّم أيمن وسيبله رقمك.',
      /** `{n}` more beyond the few the panel has room for. */
      more: 'وكمان {n} كورس',
      failed: 'مقدرناش نجيب الكورسات دلوقتي. جرّب من صفحة الكورسات.',
    },

    // ── the handoff form ───────────────────────────────────────────────
    escalate: {
      title: 'ابعت لأيمن',
      lead: 'اكتب سؤالك، والرد هيوصلك هنا في نفس المكان ومعاه إشعار.',
      leadGuest: 'اكتب سؤالك وسيبلنا اسمك ورقم الواتساب. الرد هيوصلك هنا لو رجعت، وعلى رقمك.',
      /** Above the breadcrumbs of the path the visitor walked. */
      pathLabel: 'وصل لهنا من:',
      name: 'اسمك',
      namePlaceholder: 'الاسم بالكامل',
      phone: 'رقم الواتساب',
      phonePlaceholder: '01xxxxxxxxx',
      message: 'سؤالك',
      messagePlaceholder: 'اكتب سؤالك هنا…',
      send: 'ابعت',
      sending: 'بنبعت…',
      sentTitle: 'وصلت لأيمن',
      sentBody: 'هيرد عليك من هنا. تقدر تقفل الصفحة عادي — الرد مش هيضيع.',
      failed: 'مقدرناش نبعت رسالتك. حاول تاني.',
      tooMany: 'بعتّ رسايل كتير في وقت قصير. استنى شوية وحاول تاني.',
    },

    // ── the visitor's side of an open conversation ─────────────────────
    thread: {
      title: 'محادثتك مع أيمن',
      you: 'إنت',
      ayman: 'أيمن',
      waiting: 'مستنيين رد أيمن.',
      replyPlaceholder: 'اكتب ردّك…',
      send: 'ابعت',
      closed: 'المحادثة دي اتقفلت. لو محتاج حاجة تانية ابدأ من الأول.',
      failed: 'مقدرناش نجيب المحادثة. حدّث الصفحة وحاول تاني.',
    },

    // ── /admin/inbox ───────────────────────────────────────────────────
    inbox: {
      eyebrow: 'الوارد',
      title: 'صندوق الوارد',
      subtitle: 'أسئلة الطلبة والزوار اللي محتاجة ردّك.',
      empty: 'مفيش رسايل لسه.',
      emptyHint: 'أول ما حد يطلب يكلّمك من المساعد، هتلاقي محادثته هنا.',
      // filters
      filterOpen: 'محتاجة رد',
      filterAnswered: 'اتردّ عليها',
      filterClosed: 'مقفولة',
      filterAll: 'الكل',
      // list columns
      colWho: 'مين',
      colAsked: 'السؤال',
      colWhen: 'إمتى',
      colStatus: 'الحالة',
      guestBadge: 'زائر',
      studentBadge: 'طالب',
      unanswered: 'محتاجة رد',
      // thread
      threadTitle: 'المحادثة',
      pathLabel: 'وصل لهنا من:',
      contactLabel: 'وسيلة التواصل',
      noPhone: 'مفيش رقم',
      replyLabel: 'ردّك',
      replyPlaceholder: 'اكتب ردّك للطالب…',
      reply: 'ابعت الرد',
      replying: 'بنبعت…',
      replyFailed: 'مقدرناش نبعت الرد. حاول تاني.',
      close: 'اقفل المحادثة',
      closing: 'بنقفل…',
      reopen: 'افتحها تاني',
      closed: 'المحادثة مقفولة.',
      // statuses
      statusOpen: 'مفتوحة',
      statusAnswered: 'اتردّ عليها',
      statusClosed: 'مقفولة',
    },
  },
  admin: {
    nav: {
      dashboard: 'لوحة التحكم',
      content: 'المحتوى',
      courses: 'الكورسات',
      questions: 'بنك الأسئلة',
      appeals: 'التظلمات',
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
      saveFailed: 'الحفظ فشل — التغييرات اترجعت زي ما كانت',
      cancel: 'إلغاء',
      close: 'إغلاق',
      delete: 'حذف',
      deleteConfirm: 'متأكد؟ الإجراء ده مش هيترجع.',
      required: 'الحقل ده مطلوب',
      publish: 'نشر',
    },
    course: {
      listTitle: 'الكورسات',
      new: 'كورس جديد',
      title: 'اسم الكورس',
      edit: 'تعديل الكورس',
      slug: 'المُعرّف في الرابط',
      slugHint: 'حروف إنجليزي صغيرة وأرقام وشرطات — ده اللي بيظهر في العنوان',
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
    },
    section: {
      new: 'قسم جديد',
      title: 'اسم القسم',
      summary: 'نبذة',
      empty: 'مفيش أقسام لسه',
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
      durationSeconds: 'مدة الفيديو بالثواني',
      body: 'محتوى الدرس',
      empty: 'مفيش محاضرات في القسم ده',
    },
    exam: {
      title: 'امتحان الكورس',
      hint: 'اختار محاضرة من نوع «اختبار» تبقى امتحان الكورس النهائي. مش هتتفتح للطالب غير لما يخلّص كل المحاضرات التانية، ولازم ينجح فيها عشان الكورس يتحسب خلص.',
      none: 'من غير امتحان',
      save: 'احفظ',
      noQuizLessons: 'لازم تعمل محاضرة من نوع «اختبار» الأول.',
      current: 'الامتحان الحالي',
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
      fileHint: 'PDF أو PowerPoint أو Word أو Excel — 200 ميجا كحد أقصى',
      videoUrl: 'رابط يوتيوب',
      linkUrl: 'الرابط',
      linkUrlHint: 'لازم يبدأ بـ https',
      uploading: 'بنرفع…',
      uploadFailed: 'مقدرناش نرفع الملف',
      remove: 'حذف',
      empty: 'لسه مفيش مواد. ابدأ بالبريزنتيشن الأساسي.',
      onePresentationOnly: 'فيه بريزنتيشن أساسي واحد بس لكل محاضرة.',
    },
    reorder: {
      hint: 'اسحب لإعادة الترتيب، أو استخدم زر المسافة والأسهم من الكيبورد',
      handle: 'مقبض السحب',
      pickedUp: 'اتمسكت المحاضرة في الترتيب رقم',
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
      statAppeals: 'تظلم مستني',
      statsUnavailable: 'الأرقام مش متاحة دلوقتي — جرّب حدّث الصفحة',
      sectionsTitle: 'أقسام اللوحة',
      sectionsLead: 'كل قسم بيتحكّم في حتة من اللي الطالب بيشوفه.',
      quickTitle: 'إجراءات سريعة',
      quickNewCourse: 'كورس جديد',
      quickHomeBlocks: 'أقسام الصفحة الرئيسية',
      quickMedia: 'ارفع صورة',
      quickAppeals: 'راجع التظلمات',
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
      undo: 'تراجع',
      delete: 'حذف',
      archive: 'أرشفة',
      restore: 'استرجاع',
      publish: 'نشر',
      unpublish: 'إلغاء النشر',
      create: 'إضافة',
      edit: 'تعديل',
      confirm: 'تأكيد',
      undone: 'اترجع',
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
      backToList: 'رجوع لقائمة الطلبة',
      profileSection: 'البيانات الشخصية',
      academicSection: 'البيانات الدراسية',
      fullName: 'الاسم بالكامل',
      schoolName: 'اسم المدرسة',
      fatherPhone: 'رقم هاتف ولي الأمر',
      motherPhone: 'رقم هاتف الأم',
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
  },
  quiz: {
    modes: { practice: 'تدريب', graded: 'امتحان بدرجات' },
    practiceHint: 'محاولات غير محدودة، وهتشوف الإجابة الصح بعد كل سؤال.',
    gradedHint: 'الامتحان بدرجات — راجع إجاباتك قبل ما تسلّم.',
    start: 'ابدأ الامتحان',
    resume: 'كمّل امتحانك',
    attemptNo: 'المحاولة رقم {n}',
    attemptsLeft: 'باقي لك {n} محاولة',
    unlimitedAttempts: 'محاولات غير محدودة',
    questionCount: '{n} سؤال',
    totalMarks: 'الدرجة الكلية {marks}',
    duration: 'مدة الامتحان {minutes} دقيقة',
    noTimeLimit: 'من غير وقت محدد',
    timeLeft: 'الوقت المتبقي',
    timeAlmostUp: 'الوقت قرب يخلص',
    /** Discrete screen-reader announcements at meaningful countdown
     *  thresholds only (`aria-live="polite"`, `quiz-timer.tsx`) — the visual
     *  clock still ticks every second, but a per-second `aria-live` update
     *  would interrupt a screen-reader user constantly during an exam
     *  (I7). Fixed strings, not a template over a raw number, because these
     *  fire at four known instants only. */
    timeRemaining10Min: 'باقي 10 دقايق على انتهاء وقت الامتحان',
    timeRemaining5Min: 'باقي 5 دقايق على انتهاء وقت الامتحان',
    timeRemaining1Min: 'باقي دقيقة واحدة على انتهاء وقت الامتحان',
    timeRemaining30Sec: 'باقي 30 ثانية على انتهاء وقت الامتحان',
    questionOf: 'سؤال {current} من {total}',
    next: 'التالي',
    previous: 'السابق',
    flag: 'علّم السؤال',
    unflag: 'شيل العلامة',
    flaggedCount: '{n} سؤال معلّم',
    answeredCount: 'جاوبت على {answered} من {total}',
    clearAnswer: 'امسح إجابتي',
    navigator: 'خريطة الأسئلة',
    saving: 'بيتحفظ…',
    saved: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ إجابتك — بنحاول تاني',
    staleTab: 'الامتحان ده مفتوح في مكان تاني. حدّث الصفحة عشان تكمّل من هنا.',
    submit: 'سلّم الامتحان',
    submitConfirmTitle: 'متأكد إنك عايز تسلّم؟',
    submitConfirmBody: 'بعد التسليم مش هتقدر تغيّر إجاباتك.',
    submitConfirmUnanswered: 'لسه فيه {count} سؤال من غير إجابة.',
    submitConfirmAllAnswered: 'جاوبت على كل الأسئلة.',
    submitCancel: 'ارجع للأسئلة',
    submitConfirmAction: 'أيوه، سلّم',
    alreadySubmitted: 'الامتحان ده اتسلّم خلاص.',
    timeUpTitle: 'الوقت خلص',
    timeUpBody: 'امتحانك اتسلّم تلقائيًا.',
    graceRemaining: 'الوقت خلص — عندك {seconds} ثانية تسلّم فيهم.',
    checkAnswer: 'شوف الإجابة',
    correct: 'إجابة صحيحة',
    incorrect: 'إجابة خاطئة',
    partial: 'إجابة صح جزئيًا',
    needsGrading: 'محتاج تصحيح من المدرّس',
    notAnswered: 'مجاوبتش',
    yourAnswer: 'إجابتك',
    rightAnswer: 'الإجابة الصحيحة',
    explanation: 'الشرح',
    questionFeedback: 'ملاحظة على إجابتك',
    marksEarned: '{earned} من {max}',
    resultsTitle: 'نتيجتك',
    reviewTitle: 'مراجعة إجاباتك',
    reviewLocked: 'المراجعة مش متاحة دلوقتي',
    reviewLockedUntilClose: 'هتقدر تراجع إجاباتك بعد ما الامتحان يقفل.',
    passed: 'ناجح',
    failed: 'محتاج تحاول تاني',
    passMark: 'درجة النجاح {percent}%',
    retry: 'حاول تاني',
    cooldown: 'تقدر تحاول تاني بعد {hours} ساعة',
    noAttemptsLeft: 'خلصت محاولاتك في الامتحان ده',
    closed: 'الامتحان قفل',
    notOpenYet: 'الامتحان لسه مفتحش',
    notEnrolled: 'لازم تكون مشترك في الكورس عشان تدخل الامتحان',
    previousAttempts: 'محاولاتك السابقة',
    bestScore: 'أعلى درجة',
    essayPending: 'إجابتك المقالية عند المدرّس للتصحيح',
    wordCount: '{n} كلمة',
    typeAnswer: 'اكتب إجابتك',
    chooseOne: 'اختر إجابة واحدة',
    chooseMany: 'اختر كل الإجابات الصحيحة',
    true: 'صح',
    false: 'خطأ',
    /** The join/split delimiter between multiple option bodies in a
     *  right-answer/response summary (e.g. "أ، ب") — a formatting
     *  primitive, not a message, but still Arabic-locale punctuation and so
     *  lives here rather than as a bare literal in `apps/api`/`apps/web`. */
    answerListSeparator: '، ',
    blockedTitle: 'مينفعش تدخل الامتحان دلوقتي',
    /** On `/quizzes/:lessonId`, opening the review for one past attempt. Also
     *  the per-quiz action on `/results`. */
    reviewAnswers: 'راجع إجاباتك',
    /** Replaces `start` once the student has already sat this quiz once. */
    retryQuiz: 'ادخل الامتحان تاني',
    scoreBandExcellent: 'أداء ممتاز',
    scoreBandGood: 'أداء كويس',
    scoreBandNeedsWork: 'محتاج تراجع الدرس تاني',
    reviewLockedDuringBody: 'هتقدر تراجع إجاباتك بعد ما تسلّم المحاولة.',
    unansweredChipLabel: 'سؤال {n}',
  },
  appeal: {
    open: 'قدّم تظلم',
    title: 'تظلم على الدرجة',
    note: 'اكتب سبب التظلم',
    notePlaceholder: 'وضّح ليه شايف إن الدرجة محتاجة مراجعة',
    submit: 'ابعت التظلم',
    submitted: 'وصلنا تظلمك، هنراجعه ونرد عليك',
    alreadyOpen: 'عندك تظلم مفتوح على السؤال ده',
    gradeBefore: 'الدرجة قبل التظلم',
    gradeAfter: 'الدرجة بعد التظلم',
    status: { open: 'مفتوح', under_review: 'تحت المراجعة', accepted: 'اتقبل', rejected: 'اترفض' },
    resolverNote: 'رد المدرّس',
    empty: 'مفيش تظلمات دلوقتي',
    queueTitle: 'التظلمات',
    resolve: 'اعتمد القرار',
    newMark: 'الدرجة الجديدة',
    accept: 'اقبل التظلم',
    reject: 'ارفض التظلم',
    columnStudent: 'الطالب',
    columnQuiz: 'الامتحان',
    columnQuestion: 'السؤال',
    columnNote: 'السبب',
    columnAge: 'قدّم من',
    filterAll: 'الكل',
    studentResponse: 'إجابة الطالب',
    modelAnswer: 'نموذج الإجابة',
    resolveFailed: 'مقدرناش نعتمد القرار — حاول تاني',
    resolved: 'اتحل التظلم',
  },
  quizAdmin: {
    bankTitle: 'بنك الأسئلة',
    newQuestion: 'سؤال جديد',
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
    mode: 'نوع الامتحان',
    durationMinutes: 'مدة الامتحان بالدقايق',
    gradeMethod: 'طريقة احتساب الدرجة عبر المحاولات',
    gradeMethodOptions: {
      highest: 'أعلى محاولة',
      average: 'متوسط المحاولات',
      first: 'أول محاولة',
      last: 'آخر محاولة',
    },
    openFromLabel: 'يفتح من',
    openUntilLabel: 'يقفل في',
    maxAttempts: 'أقصى عدد محاولات (٠ = غير محدود)',
    retryCooldownHours: 'المدة بين المحاولات بالساعات',
    passPercent: 'نسبة النجاح',
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
    columnQuestion: 'السؤال',
    columnN: 'عدد المحاولات',
    distractorPicks: '{n} اختار',
    columnStudent: 'الطالب',
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
  },
  quizErrors: {
    exactlyOneCorrect: 'لازم تحدد إجابة صحيحة واحدة بالظبط',
    atLeastTwoOptions: 'لازم يكون فيه اختيارين على الأقل',
    trueFalseNeedsTwo: 'سؤال صح وخطأ لازم يكون له اختيارين بالظبط',
    multiWeightsMustSumToOne: 'مجموع أوزان الإجابات الصحيحة لازم يساوي 1',
    multiNeedsPositive: 'لازم يكون فيه إجابة صحيحة واحدة على الأقل',
    shortAnswerNeedsFullCredit: 'لازم يكون فيه نموذج إجابة واحد على الأقل بوزن 1',
    patternRequired: 'اكتب نموذج الإجابة',
    patternTooLong: 'نموذج الإجابة طويل جدًا',
    tooManyWildcards: 'نموذج الإجابة فيه علامات * كتير جدًا',
    stemRequired: 'اكتب نص السؤال',
    optionBodyRequired: 'اكتب نص الاختيار',
    essayHasNoOptions: 'السؤال المقالي مالوش اختيارات',
    maxWordsBelowMin: 'أكبر عدد كلمات لازم يكون أكبر من أقل عدد',
    fractionRange: 'وزن الاختيار لازم يكون بين -1 و 1',
    importNoQuestions: 'مفيش أسئلة في النص ده',
    importNoAnswerLine: 'السؤال رقم {n}: مفيش سطر إجابة',
    importUnknownLetter: 'السؤال رقم {n}: حرف إجابة مش موجود ({letter})',
    importNoOptions: 'السؤال رقم {n}: مفيش اختيارات',
    importUnknownType: 'السؤال رقم {n}: نوع سؤال مش معروف',
  },
} as const;

export type Copy = typeof copy;
