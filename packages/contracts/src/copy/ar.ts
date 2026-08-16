/**
 * The Arabic string table. No component may contain a user-facing literal.
 * This is what makes adding English later a routing change rather than a rewrite.
 *
 * It is no longer quite *single*: the admin namespaces (`admin`, `quizAdmin`,
 * `adminNews`) live in `./admin.ts`, which imports this file and re-exports a
 * `copy` with all of them merged in. A third of the table was course-builder,
 * question-bank and «نيوز»-editor strings, and because a bundler cannot
 * tree-shake properties off one object literal, every student route was
 * shipping and parsing them. See that file's header for the measurements.
 *
 * ⚠️ The arrow points one way only. `./admin.ts` may import this module; this
 * module must never import `./admin.ts`, and neither may the `@ayman/contracts`
 * root barrel, which re-exports `copy` from HERE. Reversing it costs nothing
 * visible — no error, no failing type — the admin table simply lands back on
 * /dashboard and every lesson. Anything genuinely needed on both sides goes in
 * `common` below.
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
    /** One question now, not four — see `fixedSectionTitle` right below. */
    step3Title: 'إنت في سنة كام',
    /**
     * Was «بيانات زيادة» over two optional parent numbers behind a «سيبها
     * دلوقتي» button. It now asks for the father's number only, and requires
     * it — so a title that calls it "extra" would be describing the old form.
     */
    step4Title: 'تليفون ولي الأمر',
    /**
     * The disclosure line, rendered under every step of the form.
     *
     * Not optional polish. This form asks a student — usually a minor — for
     * their phone number, and on the last step for their father's.
     * Until 2026-08-06 nothing on the page, or anywhere on the domain, said
     * who receives that or why; Google flagged the site under
     * «الصفحات المضلّلة» (social engineering) and the only honest reading was
     * that it was right to. The link is the fix, and it belongs HERE, next to
     * the fields, not only in the footer.
     */
    privacyNote: 'بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش ولا بتتشارك مع حد.',
    privacyLink: 'اعرف بالظبط بنجمع إيه وليه',
    /**
     * On the father's-phone step, where the ask is largest — and larger than
     * it used to be, because the number is now required rather than skippable.
     * A demand with no reason attached is the thing that got this form flagged
     * in the first place (see `privacyNote` above).
     */
    parentPhonesWhy:
      'الرقم ده عشان نقدر نتواصل مع ولي أمرك عن مستواك لو احتجنا. مابنستعملهوش في أي حاجة تانية.',
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
    /**
     * The student's own «لغات ولا عام», the half that was missing from the
     * split `copy.stream` already describes on a course. The two option
     * labels come from `copy.stream.general` / `.languages` rather than being
     * retyped here, so a student picking «لغات» and a course badged «لغات»
     * cannot end up spelled differently.
     */
    schoolStream: 'مدرستك',
    schoolStreamPlaceholder: 'مدرسة عام ولا لغات؟',
    schoolStreamError: 'اختر نوع مدرستك',
    system: 'النظام الدراسي',
    systemPlaceholder: 'اختر النظام الدراسي',
    year: 'الصف الدراسي',
    yearPlaceholder: 'اختر الصف الدراسي',
    track: 'المسار',
    trackPlaceholder: 'اختر المسار',
    subject: 'المادة',
    electiveSubject: 'المادة الاختيارية',
    electiveSubjectPlaceholder: 'اختر المادة الاختيارية',
    /**
     * The system, the track and the subject, stated instead of asked.
     *
     * They were three dropdowns with one right answer each — this platform is
     * البكالوريا / مسار الهندسة وعلوم الحاسب / البرمجة and nothing else — plus
     * a cascade of hide-and-clear rules to keep them consistent with one
     * another. The year is the only one of the four that varies between
     * students, so it is the only one still asked for.
     *
     * Written out here rather than read off the taxonomy on purpose: this
     * describes the PLATFORM, and a first-year student (year 1 is common, it
     * has no track at all) would otherwise be shown an empty half.
     */
    fixedSectionTitle: 'الباقي إحنا عارفينه',
    fixedSystem: 'البكالوريا المصرية',
    fixedTrack: 'مسار الهندسة وعلوم الحاسب',
    fixedSubject: 'البرمجة وعلوم الحاسب',
    fixedSectionHint:
      'المنصّة دي للبكالوريا بس، ولمادة البرمجة تحديدًا — فمش هنسألك على نظام ولا مسار ولا مادة.',
    fatherPhone: 'رقم هاتف الأب',
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
    submit: 'احفظ وكمّل',
    submitPending: 'جارٍ الحفظ…',
    submitError: 'مقدرناش نحفظ بياناتك. راجعها وحاول تاني.',
    phoneConflictError: 'الرقم ده متسجّل على حساب تاني',

    /**
     * When `/api/taxonomy` cannot be read at all, so there are no governorates
     * and no years to put in the selects.
     *
     * The wizard is the one screen where a degraded render is NOT an option:
     * every other page can drop a label and still be useful, but a student who
     * cannot answer «إنت فين» and «إنت في سنة كام» cannot finish onboarding,
     * and `proxy.ts` will keep sending them back here. So the page says the
     * form is missing and why, rather than rendering four empty dropdowns that
     * look like the student's own browser is broken.
     *
     * Three things this wording has to do, in order: put the fault on us, say
     * nothing was lost (they have usually just signed up and are one screen
     * from their first course), and give a real next step. «حاول تاني» comes
     * from `copy.common.retry` — one retry label for the product, not a
     * seventh copy of the same two words.
     */
    unavailableTitle: 'مش قادرين نجيب قايمة المحافظات والصفوف دلوقتي',
    unavailableBody:
      'المشكلة عندنا إحنا مش عندك، وحسابك اتعمل تمام ومحصلش أي حاجة له. استنى دقيقة وجرّب تاني — هتكمّل من نفس المكان.',
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
    /**
     * The consent line under the sign-up button, split so the two page names
     * can be real links rather than one string with markup baked into it.
     * Rendered as: {legalBefore} [شروط الاستخدام] {legalAnd} [سياسة الخصوصية].
     */
    legalBefore: 'بإنشاء الحساب إنت موافق على',
    legalAnd: 'و',
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

      /**
       * حظر — the ONE documented exception to the rule stated above, and it
       * does not weaken it.
       *
       * The API returns `ACCOUNT_BANNED` only AFTER the submitted password has
       * verified (`login-security.hook.ts`). So this string can only ever be
       * shown to someone who has just proved they hold the account's
       * credentials — it tells them nothing they could not already establish,
       * and it is therefore not an enumeration signal. Every other failure
       * mode still renders `login` above.
       *
       * It exists because the alternative is worse for the person reading it:
       * a banned student shown «البريد أو كلمة المرور مش مظبوطين» retypes their
       * password, trips the progressive delay, waits thirty seconds, tries
       * again, and eventually messages the instructor about an account he
       * himself suspended.
       */
      loginBanned: 'حسابك موقوف دلوقتي، فمش هتقدر تدخل.',
      /** Prefixes the admin's own words. `{reason}` is operator-authored. */
      loginBannedReason: 'السبب: {reason}',
      loginBannedContact: 'لو شايف إن فيه غلط، كلّم المدرّس.',
    },
  },
  /**
   * Strings with no single owner: the four states any screen can be in, plus
   * the handful of words that turned out to sit on both sides of the
   * student/admin line.
   *
   * That second group is load-bearing, not tidiness. `close`, `saveFailed`,
   * `undo`, `undone` and `question` used to live in `copy.admin.common`,
   * `copy.admin.actions` and `copy.quizAdmin` — and were read from
   * student-facing components anyway: the mobile nav sheet, the exam gate, the
   * submit dialog, the quiz runner's save-failed toast, the question
   * navigator's aria-label, the undo toast. Once the admin namespaces moved to
   * `./admin.ts` those six references were the only thing left importing it
   * from a student route, so five strings would have kept ~37,000 characters
   * of course-builder copy on /dashboard and on every lesson. `./admin.ts`
   * aliases them straight back, so `copy.admin.common.close` still resolves
   * and the two sides cannot word the same button differently.
   *
   * Anything that later turns out to be needed on both sides comes HERE. Never
   * the other way round — a student component must not reach into `copy.admin`.
   */
  common: {
    loading: 'ثانية واحدة…',
    error: 'حصلت مشكلة',
    retry: 'حاول تاني',
    empty: 'مفيش حاجة هنا لسه',
    // Plan 6 append.
    undo: 'تراجع',
    /** The result of that undo, announced once the restore call comes back. */
    undone: 'اترجع',
    /**
     * The accessible NAME of a dialog's or sheet's close button — `@ayman/ui`
     * takes it as a required `closeLabel` prop rather than importing copy, so
     * this string reaches the student shell through four different call sites.
     */
    close: 'إغلاق',
    /** An optimistic edit that did not stick, and has been rolled back on screen. */
    saveFailed: 'الحفظ فشل — التغييرات اترجعت زي ما كانت',
    /**
     * The bare noun. It labels a column in the admin item-analysis table and
     * prefixes the numbered aria-label in the student question navigator
     * («السؤال ٣»); it is not a sentence and must stay short enough to be both.
     */
    question: 'السؤال',
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
    /**
     * ⚠️ The SAME screen, shown for the OPPOSITE reason, and it has to say so.
     *
     * The service worker hands this page back whenever a navigation `fetch`
     * rejects, and «مفيش نت» is only one of the two things that causes. The
     * other is us: for the few seconds of a deploy the old container is down
     * and the new one is still coming up, so the request fails with the
     * student's connection working perfectly. Telling someone on full 4G that
     * their internet is out sends them to reboot a router, and it is the
     * version that got reported — «بيروح جايب لي صفحة سوداء… لازم أعمل
     * try again عشان تشتغل».
     *
     * `navigator.onLine` tells the two apart from the browser's own view of
     * the radio, and the page picks its wording from that.
     */
    serverTitle: 'المنصة مش راضية ترد دلوقتي',
    serverBody:
      'نتك شغال — المشكلة عندنا إحنا. دي بتحصل لتانية وقت التحديث، وبترجع لوحدها. استنى شوية وحاول تاني.',
    /** Announced while the automatic retry is in flight, so the button is not just dead. */
    retrying: 'بيحاول تاني…',
  },
  /**
   * The React error boundaries — what renders when a Server Component below
   * them throws.
   *
   * Until now there were none: `git ls-tree -r -- apps/web/app | grep error`
   * returned nothing, so ANY unhandled throw under `app/` fell all the way to
   * Next's built-in error page — unstyled, left-to-right, in English, on a
   * product whose every other screen is Arabic and RTL. A student mid-lesson
   * saw a page that did not look like it belonged to us and could not tell it
   * apart from their phone being broken.
   *
   * That gap is what made two separate audit findings land as hard as they
   * did — an uncached taxonomy read exhausting the API's shared 60/min
   * throttle bucket (see `onboarding.unavailable*`, which is the SAME failure
   * caught one level lower) and a `revalidatePath('/', 'layout')` purging the
   * whole cache cluster. Both causes are fixed. This is the net that was never
   * hung under them, and it is what the next unknown cause will land on.
   *
   * The voice is `onboarding.unavailable*`'s, because that is the degraded
   * state this product already had and already got right, in this order:
   * put the fault on us, say what was NOT lost, then give a next step that is
   * not the page that just failed. Deliberately absent: the word «خطأ» on the
   * student surface (it reads as the student's mistake), any apology beyond
   * the first clause, and «حاول مرة أخرى لاحقاً» — a next step with no time
   * attached is not a next step.
   *
   * Only the strings that genuinely differ per surface are here. The retry
   * label is `common.retry` and the two destinations are `nav.dashboard` and
   * `nav.home`, so the escape hatch out of a broken screen is named the same
   * word the working chrome names it — a student who has just been dropped
   * somewhere strange should not also have to learn a new noun.
   */
  errors: {
    /**
     * The label in front of `error.digest`.
     *
     * `digest` is the hash Next puts in the SERVER log beside the real stack,
     * and in production it is the only handle anyone has on one specific
     * failure — a student can read it into المساعد, and it matches a line in
     * the log. Labelled rather than printed bare: an unexplained hex string on
     * an error screen reads as more breakage.
     *
     * ⚠️ It is `undefined` for a client-side render error and undefined in
     * development, so every surface renders it conditionally. Do not "fix"
     * that with a fallback string — «مفيش كود» is worse than no line.
     *
     * `error.message` is rendered NOWHERE, on any surface, on purpose. In a
     * production build Next replaces a Server Component's message with one
     * fixed generic sentence before it ever reaches the client, so it carries
     * exactly zero information; in development it carries a stack trace, which
     * on the student surface is noise and on the public surface is a leak.
     */
    digestLabel: 'كود العطل',

    /**
     * The signed-in student, and the one of these that matters most: whoever
     * is reading it was in the middle of a lesson, a revision or a graded
     * attempt.
     *
     * The body claims that the ACCOUNT and the SAVED progress are intact,
     * which is true — both live on the server and a failed render cannot
     * touch them. It deliberately does NOT claim that an answer being typed
     * at that moment was saved, because this boundary cannot know that, and
     * a promise that turns out false on the quiz results screen costs more
     * than the reassurance was worth.
     */
    app: {
      title: 'الصفحة دي مافتحتش',
      body: 'المشكلة عندنا إحنا مش عندك. حسابك وكل اللي ذاكرته متسجّل زي ما هو ومامسّهوش حاجة. جرّب تحمّل الصفحة تاني، ولو فضلت واقفة ارجع لحسابك وكمّل من مكان تاني.',
    },

    /**
     * The public marketing surface. A visitor here is not invested yet and
     * has nothing at stake, so there is nothing to reassure them about — the
     * job is to keep them on the site instead of closing the tab.
     *
     * «باقي الموقع شغّال عادي» is the load-bearing half and it is literally
     * true: this is a per-route-group boundary, so a throw on one page has no
     * bearing on any other.
     */
    site: {
      title: 'حصلت مشكلة في الصفحة دي',
      body: 'المشكلة عندنا إحنا مش عندك. جرّب تحمّلها تاني، ولو فضلت زي ما هي ارجع للرئيسية — باقي الموقع شغّال عادي.',
    },

    /**
     * /login and /register. Same visitor as `site`, one screen later and
     * with a password half-typed, so the one thing worth saying that the
     * public wording does not say is that nothing happened to the account.
     */
    auth: {
      title: 'مقدرناش نفتح الصفحة دي',
      body: 'المشكلة عندنا إحنا مش عندك، وحسابك زي ما هو — مفيش حاجة اتغيّرت فيه. جرّب تاني بعد ثانية.',
    },

    /**
     * `app/global-error.tsx`: the ROOT layout itself threw, so this replaces
     * the entire document and nothing above it rendered.
     *
     * Shorter than the rest, and it names no destination, because at this
     * point every route in the product is going through the same broken root
     * layout — «ارجع للرئيسية» would be sending someone back into the thing
     * that just failed. What it offers instead is a full page load, which is
     * the only recovery that throws the broken client runtime away; see the
     * component.
     */
    global: {
      title: 'الموقع مش قادر يفتح دلوقتي',
      body: 'المشكلة عندنا إحنا مش عندك، وحسابك وبياناتك مامسّهمش حاجة. حمّل الصفحة من الأول، ولو فضلت واقفة استنى شوية وجرّب تاني.',
      /**
       * The secondary action, and the only string in this namespace that
       * cannot borrow a label from the chrome — there is no chrome. It says
       * "load the whole page again", not «حاول تاني», precisely so it does
       * not read as a duplicate of the retry button beside it.
       */
      reload: 'حمّل الصفحة من الأول',
    },

    /**
     * The BACKSTOP, and the only one of these whose reason for existing is a
     * detail of Next's boundary hierarchy rather than a surface of the product.
     *
     * `error.tsx` wraps the pages and the nested layouts BELOW it — never the
     * `layout.tsx` sitting in its own segment. So a throw inside
     * `(admin)/layout.tsx`, or inside any of the Suspense-wrapped chrome slots
     * the group layouts render (`account-menu`, `rail-courses`,
     * `notification-bell`, `site-account-slot`), sails straight past that
     * group's own boundary. Not hypothetical: `lib/session.ts`'s `getSession()`
     * throws on any non-401 non-ok response, `(admin)/layout.tsx` awaits it on
     * its first line, and a 429 from the shared throttle bucket the audit found
     * is exactly such a response. Without this file, staff who hit that got the
     * entire document replaced by the styleless `global-error.tsx`.
     *
     * It also covers the routes belonging to no group at all — `/offline`,
     * `/md/[[...slug]]`, `/docs/api`, `/dev/*`.
     *
     * Deliberately plainer than the four surface boundaries. It renders inside
     * the ROOT layout, so the fonts and the stylesheet are alive, but OUTSIDE
     * every group shell, so there is no rail and no site nav to sit within. It
     * cannot know which surface the reader came from — that is precisely why it
     * was the one to catch the error — so it must not guess, and must not offer
     * a destination that assumes one. Hence «الصفحة الرئيسية» and not the
     * dashboard.
     */
    root: {
      title: 'حصلت مشكلة وإحنا بنجهّز الصفحة',
      body: 'المشكلة عندنا إحنا مش عندك، وحسابك وكل اللي ذاكرته زي ما هو. جرّب تاني، ولو فضلت واقفة ارجع للصفحة الرئيسية وادخل من هناك.',
    },
  },

  /**
   * 404 — a URL that matches no route, or a page that called `notFound()`
   * because the record behind it does not exist (a deleted course slug, an
   * unpublished article, `/years/9`).
   *
   * ## Why this block exists at all
   *
   * Until 2026-08-15 the app shipped NO `not-found.tsx` on any surface, so
   * every one of those cases fell through to Next's built-in page and an
   * Arabic RTL platform for Egyptian school students answered with:
   *
   *     404 | This page could not be found.
   *
   * — English, LTR, no stylesheet, no nav, no footer, no way back. Measured on
   * production that day at `/this-does-not-exist`.
   *
   * ## Why the wording is not the error wording
   *
   * `errors.*` above all open with «المشكلة عندنا إحنا مش عندك», because a
   * thrown render IS our fault. A 404 usually is not — the link was old, the
   * course was unpublished, the address was mistyped — and repeating an
   * apology for a broken system in front of someone who simply followed a
   * stale link tells them something false about the platform. So these say
   * what happened, blame nobody, and spend the rest of the sentence pointing
   * somewhere useful.
   *
   * There is also no retry button on a 404 and no `digest`: nothing failed,
   * so there is nothing to retry and no log line to quote. That is the
   * structural difference from `errors.*` and the reason these are separate
   * strings rather than a reused pair.
   */
  notFound: {
    /**
     * The public marketing surface: an unmatched URL, a dead course slug, an
     * unpublished article, a year outside 1–3.
     *
     * The visitor may have arrived from Google on a URL that no longer
     * resolves, so the catalogue — not the homepage — is the destination that
     * most often has what they came for.
     */
    site: {
      title: 'الصفحة دي مش موجودة',
      body: 'يمكن الرابط قديم أو فيه حرف ناقص، أو الصفحة اتشالت. تقدر ترجع للرئيسية أو تتفرّج على الكورسات المتاحة.',
      cta: 'كل الكورسات',
    },

    /**
     * The signed-in student. Different from `site` in one way that matters:
     * this person HAS somewhere to be, and it is not the marketing homepage.
     * Sending them to `/` would show them the signed-out landing page they
     * have no use for, so the primary destination is the dashboard.
     */
    app: {
      title: 'الصفحة دي مش موجودة',
      body: 'يمكن الدرس أو الكورس ده اتشال أو الرابط قديم. حسابك وكل اللي ذاكرته زي ما هو — ارجع لحسابك وكمّل من هناك.',
      cta: 'روح لحسابي',
    },

    /**
     * Staff. They are far more likely than a student to have reached this by
     * an id that was deleted from under them, so the wording names that case
     * instead of guessing at a typo.
     */
    admin: {
      title: 'الصفحة دي مش موجودة',
      body: 'يمكن العنصر ده اتمسح أو الرابط اتغيّر. ارجع للوحة التحكم وجرّب من هناك.',
      cta: 'لوحة التحكم',
    },

    /**
     * The backstop, rendered for a URL matching no route in any group — which
     * is the single most common 404 on the whole site. Same constraint as
     * `errors.root`: it renders outside every group shell and cannot know
     * which surface the reader came from, so the only destination it may
     * offer is «الرئيسية».
     */
    root: {
      title: 'الصفحة دي مش موجودة',
      body: 'الرابط اللي فتحته مش موجود على المنصة. يمكن يكون قديم أو مكتوب غلط — ارجع للرئيسية وابدأ من هناك.',
      cta: 'الرئيسية',
    },
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
    /**
     * The hero's second line cycles through these. `heroLine2` stays as the
     * first entry and as the static fallback under reduced motion.
     *
     * ⚠️ Every entry has to complete «من أول سطر كود …» on its own, AND has to
     * open with a different word from the others.
     *
     * All four used to start with «لحد», so the one line on the page that
     * moves said the same word every time it moved — the rotation drew the eye
     * and then delivered nothing new. Reported as «مكتوب كل مرة لحد… عايزه
     * يبقى كلام متناسق وصح». Two of them were also awkward Arabic after the
     * fixed first line: «من أول سطر كود لحد ما الفكرة تبقى بديهية» and «…لحد ما
     * تبطّل تحفظ خالص» both read as a sentence that changed its mind halfway.
     *
     * The openings are now لحد / لأول / لآخر / لليوم, and each one is a phrase
     * that finishes the sentence cleanly.
     */
    heroRotating: [
      'لحد آخر سؤال في الامتحان.',
      'لأول مشروع تكتبه لوحدك.',
      'لآخر تمرين من غير مساعدة.',
      'لليوم اللي تبطّل تحفظ فيه.',
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
    faq8Q: 'مش عارف يعني إيه متغيّر ولا دالة — أعمل إيه؟',
    faq8A: 'ابدأ بصفحة المصطلحات. اتناشر مصطلح بيتكرروا في أي لغة برمجة، كل واحد متشرح في سطرين بالعربي ومعاه اسمه بالإنجليزي زي ما هتلاقيه في الكود.',
    faq9Q: 'كورسات صفّي ألاقيها فين؟',
    faq9A: 'فيه صفحة لكل صف — الأول والتاني والتالت بكالوريا — وفيها كورسات الصف ده بترتيبها. تدخلها من «كورسات» فوق.',
    faq10Q: 'محتاج أنزّل برامج على جهازي عشان أكتب كود؟',
    faq10A: 'لأ، ولا برنامج واحد. المحرّر شغّال جوه المنصة نفسها، بتكتب فيه وتشغّل من المتصفح على طول.',
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
    /**
     * Shown by CSS only when the stream filter hides every card. It is always
     * in the DOM — the filter never removes a card, so nothing else could
     * tell the difference between "your choice matched nothing" and "the page
     * broke".
     */
    emptyForStream: 'مفيش كورسات للاختيار ده',
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
  /** `/settings/section` — changing the year after onboarding. */
  section: {
    eyebrow: 'الإعدادات',
    title: 'صفّك الدراسي',
    subtitle: 'غيّره في أي وقت — الكورسات اللي تظهرلك بتتغيّر معاه.',
    save: 'احفظ',
    saving: 'جارٍ الحفظ…',
    saveFailed: 'مقدرناش نحفظ التغيير. حاول تاني.',
    /**
     * The reassurance a student needs before touching this. Changing section
     * writes four columns and nothing else — see `updateSection` in the API.
     */
    keepsProgress:
      'تقدمك محفوظ. لو رجعت لصفّك القديم هتلاقي كل اللي خلّصته ودرجاتك زي ما هي.',
    back: 'رجوع للكورسات',

    /**
     * When `/api/taxonomy` cannot be read, so the year select would have no
     * options. Same situation as `onboarding.unavailable*`, deliberately worded
     * differently: this student already HAS a section and is only changing it,
     * so the reassurance they need is that the setting they already have is
     * untouched — not that their account survived. Rendering the form with an
     * empty select would let them press «احفظ» on nothing, and the API would
     * answer with a validation error that blames them for it.
     *
     * The retry label is `copy.common.retry`.
     */
    unavailableTitle: 'مش قادرين نجيب قايمة الصفوف دلوقتي',
    unavailableBody:
      'مشكلة مؤقتة عندنا. صفّك الحالي وكل تقدمك زي ما هما ومحصلّهمش حاجة — جرّب تاني بعد شوية.',
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
  /**
   * مدارس عام / مدارس لغات.
   *
   * Top-level rather than under `admin`, because the same four words label the
   * checkbox the teacher ticks AND the badge a stranger reads on the landing
   * page. One definition means the two can never drift into saying different
   * things about the same course.
   */
  stream: {
    label: 'المدارس',
    hint: 'اختار عام أو لغات أو الاتنين',
    general: 'عام',
    languages: 'لغات',
    /** The badge when a course or lesson serves both — not a third stream. */
    both: 'عام ولغات',
    required: 'لازم تختار عام أو لغات أو الاتنين',
    /** The `?stream=` filter's neutral option. */
    filterAll: 'الكل',
    filterLabel: 'اعرض لـ',
    /**
     * Shown next to a lesson whose streams do not overlap its course's. Not an
     * error and nothing is blocked — the lesson is simply labelled for an
     * audience the course says it does not serve, and only the teacher can say
     * which of the two is the mistake.
     */
    lessonOutsideCourse: 'المحاضرة دي متعلّمة لمدارس الكورس نفسه مش بيخدمها',
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
    /**
     * A course the instructor has closed. Deliberately NOT «حاول تاني» — the
     * student can retry all day and the door stays shut; what they need is to
     * know it is shut on purpose and who opens it.
     */
    lockedError: 'الكورس ده مقفول دلوقتي. كلّم المهندس أيمن عشان يفتحهولك.',
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
    /**
     * Shown beside «خلّصت» when recording the completion fails.
     *
     * `LessonNav.finish` used to be `try { … } finally { setSaving(false) }`
     * with no `catch`, so any rejection was swallowed by the async handler:
     * the button went back to «خلّصت», the lesson stayed uncompleted, the
     * course percentage did not move, and the NEXT lesson stayed gated with
     * nothing on screen explaining why. The student is then stuck on a lesson
     * they have finished, pressing a button that reports success.
     *
     * Says what did not happen («ماتسجّلش»), because the student's real
     * question at that moment is whether they have to watch it again.
     */
    markFailed: 'ماتسجّلش إنك خلّصت الدرس. اتأكد من النت ودوس تاني.',
    completed: 'تم',
    inProgress: 'شغّال',
    notStarted: 'لسه',
    play: 'شغّل الفيديو',
    /**
     * The resume line under «شغّل الفيديو» on the poster, read as one phrase
     * with a clock after it: «أكمل من 27:14».
     *
     * Two strings rather than one `{time}` template, unlike `path.summary`:
     * the clock is rendered in its own `.mono .tabular` span so the digits do
     * not shift width as the number changes, and a placeholder inside this
     * string would drag them into the body font. Western digits, per §4.1 —
     * see `formatDuration`, which owns every clock in the product.
     */
    resumeFrom: 'أكمل من',
    /**
     * Beside the resume line: the way back to the beginning.
     *
     * Not decoration. What the player resumes from is `maxPositionSeconds`,
     * the FURTHEST second the student ever reached — not the last one they
     * were sitting on. A student who deliberately rewound to re-hear an
     * explanation and then closed the tab gets sent forward again when they
     * come back, and this is the control that undoes that in one tap. It has
     * to be on screen at the same moment the resume is offered, never behind
     * a menu.
     */
    restart: 'من الأول',
    videoUnavailable: 'الفيديو مش متاح دلوقتي',
    resources: 'مواد الدرس',
    /**
     * `<LessonMaterials>` — the one control that opens everything attached to
     * a lesson. Says «المحاضرة» rather than «الدرس» because that is the word
     * used out loud, and because the button is asked for as «تحميل المحاضرة».
     */
    materials: 'مواد المحاضرة',
    /** Follows a number: «٣ حاجات مرفوعة». */
    materialsCount: 'حاجات مرفوعة',
    /** The document card, before and after its viewer is opened. */
    openDocument: 'دوس عشان تفتحه',
    closeDocument: 'دوس عشان تقفله',
    mainPresentation: 'البريزنتيشن الأساسي',
    openInNewTab: 'افتح في تبويب جديد',
    viewerUnavailable: 'المتصفح مش قادر يعرض الملف — نزّله وشوفه.',
    noResources: 'مفيش مواد مرفوعة للدرس ده.',
    lockedHint: 'خلّص اللي قبله الأول عشان يتفتح',
    examBadge: 'امتحان',
    examLockedHint: 'الامتحان بيتفتح لما تخلّص كل المحاضرات',
    /**
     * ⚠️ Says «المحاضرة» because every document under a lesson IS the lecture's
     * material — the deck, the sheet, the notes. Asked for by name: «يبقى في
     * مكان اسمه تنزيل المحاضرة بس بالعربي».
     *
     * It replaced a `تحميل` link sitting next to the raw storage FILENAME,
     * which for an Arabic upload rendered as «Ø£Ø³Ø§Ø³ÙØ§Øª Ø§ÙØ¨Ø±ÙØ¬Ø©…» —
     * see `decodeOriginalName` in the API for why, and `<DocumentViewer>` for
     * why the name is no longer shown at all.
     */
    download: 'نزّل المحاضرة',
    quizIntro: 'الدرس ده اختبار — ابدأ لما تكون جاهز.',
    quizCta: 'ابدأ الاختبار',
    courseProgress: 'تقدّمك في الكورس',
    lessonsCompleted: 'درس خلص من',
    autoCompleteHint: 'الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.',
    manualOnlyHint: 'مدة الفيديو مش متسجّلة، فدوس «خلّصت الدرس» لما تنتهي.',
    /* A quiz lesson has its own completion rule and it is not the two above:
       there is no video to watch and no button to press — passing the exam is
       what closes it. It used to be shown `manualOnlyHint`, which talks about
       a video's duration on a lesson that has no video. */
    quizAutoCompleteHint: 'الدرس ده بيتقفل لوحده أول ما تنجح في الاختبار.',
    quizYourScore: 'درجتك في الاختبار',
    quizNotSatYet: 'لسه مدخلتش الاختبار.',
    quizPassedNote: 'نجحت، والدرس اتقفل.',
    quizFailedNote: 'تقدر تراجع إجاباتك وتدخل تاني لو الاختبار لسه مفتوح.',
    quizOpenCta: 'افتح الاختبار',
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

    // ── the exams section ────────────────────────────────────────────────
    examsTitle: 'امتحاناتك',
    examsEmpty: 'لسه مامتحنتش أي حاجة. أول امتحان تخلّصه هيبان هنا بدرجته.',
    examsEmptyCta: 'روح لكورساتك',
    /** On a row whose exam still has its improvement sitting waiting. */
    examsImproveHint: 'لسه قدامك محاولة تحسين',
    examsAll: 'كل امتحاناتك',
    scoreOn: 'في',
    // ── «نقاط ضعفك» — the mastery card ───────────────────────────────────
    mastery: {
      title: 'ذاكر ده',
      /** `{n}` — how many topics cleared the evidence floor. Present so three
       *  rows do not read as "these are all the topics that exist". */
      evaluatedCount: '{n} موضوع اتقاسوا',
      reviewCta: 'راجع',
      strongLabel: 'متمكّن في:',
      /** Nothing sat yet, or every topic still under the evidence floor. */
      emptyBody:
        'لسه بنجمّع صورة عن مستواك. امتحن كام امتحان وهتلاقي هنا بالظبط إنت ضعيف في إيه.',
      /** Topics measured, none under the review bar. A separate string from
       *  `emptyBody` on purpose: "we have not measured you" and "we measured
       *  you and you are fine" are different facts, and a student who has
       *  mastered everything should not be told the platform knows nothing. */
      allClearBody: 'مفيش موضوع محتاج مراجعة دلوقتي — كل اللي اتقاس فوق السبعين.',
      /** `{n}` — topics seen but not yet judged. Appended under the rows. */
      pendingNote: 'لسه في {n} موضوع تحت القياس.',
      /** `{topic}`, `{percent}` — the accessible name of a row, because the
       *  bar itself is `aria-hidden` and the figure beside it is decorative. */
      accessibleRow: '{topic} — {percent}٪ من الدرجات',
    },
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

    /**
     * «إنجازاتك» — the markers strip. Every title is a NOUN and every hint is
     * an instruction, because the two are read in different states: the title
     * alone once earned, and «title — لسه: hint» while it is not.
     *
     * Nothing here is persisted; see `apps/web/lib/achievements.ts` for why,
     * and for which payload field decides each one.
     */
    badges: {
      title: 'إنجازاتك',
      /**
       * The gloss beside the heading. It exists because an unearned marker is
       * an outlined disc and a noun, and nothing on it says how to get it —
       * the condition is in the `title` and the accessible name, neither of
       * which a student reads at a glance. One line saying the strip fills
       * itself is what stops six grey circles reading as six locked features.
       */
      note: 'بتتفتح لوحدها وإنت بتذاكر.',
      /** `{earned}` of `{total}`, in the section heading's count slot. */
      count: '{earned} من {total}',
      /** Appended to an earned marker's accessible name. */
      earned: 'اتحقّق',
      /** Appended to one that has not been earned, before its hint. */
      locked: 'لسه',
      firstLessonTitle: 'أول درس',
      firstLessonHint: 'خلّص أول محاضرة لحد آخرها.',
      tenLessonsTitle: 'عشر دروس',
      tenLessonsHint: 'خلّص عشر محاضرات في أي كورس.',
      firstExamTitle: 'أول امتحان',
      firstExamHint: 'ادخل أول امتحان وسلّمه.',
      firstPassTitle: 'أول نجاح',
      firstPassHint: 'اعدّي أي امتحان.',
      courseDoneTitle: 'كورس كامل',
      courseDoneHint: 'خلّص كورس من أوله لآخره.',
      distinctionTitle: 'امتياز',
      distinctionHint: 'خُد ٩٠٪ أو أكتر في أي امتحان.',
    },
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
    /**
     * The floating launcher can be PICKED UP and put somewhere else, because
     * on a phone it is a 56px disc pinned over the bottom corner of whatever
     * the page ends with — «بجد أخد مساحة كبيرة جدا». Moving it is the fix
     * that does not cost anyone the button.
     *
     * Appended to the launcher's accessible name rather than shown: the
     * gesture is a press-and-hold, which has no visual affordance worth
     * drawing on a button this small, and a permanent «اسحبني» label would
     * make it bigger — the opposite of the complaint.
     */
    drag: 'دوس مطوّل واسحب عشان تنقله',
    /** Announced once the launcher is picked up, so the state change is not silent. */
    dragging: 'بتنقل المساعد — سيبه في المكان اللي عايزه',
    /** Puts a moved launcher back in its corner. Shown only once it HAS moved. */
    resetPosition: 'رجّع المساعد مكانه',
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
        'كل كويز ليه محاولة واحدة بس، ودرجتها بتتسجّل وبتفضل. الاستثناء الوحيد هو الامتحان النهائي بتاع الكورس: بعد ما تمتحنه تقدر تدخل امتحان تحسين مرة واحدة بأسئلة مختلفة، وأعلى درجة في الاتنين هي اللي بتتحسب — يعني التحسين مش بيضيّع منك درجة. ولو حصلت مشكلة تقنية في نص الامتحان، كلّم أيمن.',
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

      /* ── التنبيه بالرسايل الجديدة ────────────────────────────────────────
       *
       * The sidebar badge and the alert that fires when the number goes up.
       * The badge counts threads that still NEED AN ANSWER — the same rule the
       * inbox's default filter uses — so glancing at the number and opening the
       * screen can never disagree.
       */
      /** `{n}` — threads waiting for a reply. Screen-reader text for the badge. */
      badgeLabel: '{n} رسالة محتاجة رد',
      /** The OS/toast notification when a new message lands. */
      alertTitle: 'رسالة جديدة في صندوق الوارد',
      /** `{n}` — how many arrived since the last check. */
      alertBodyOne: 'في رسالة جديدة محتاجة ردّك.',
      alertBodyMany: 'في {n} رسايل جديدة محتاجة ردّك.',
      alertOpen: 'افتح الوارد',
      /** The header toggle that asks the browser for notification permission. */
      alertsEnable: 'فعّل تنبيهات الرسايل',
      alertsEnabled: 'التنبيهات شغالة',
      alertsBlocked: 'المتصفح مانع التنبيهات — فعّلها من إعدادات الموقع',
    },
  },
  /**
   * «نيوز» — the public articles section.
   *
   * ⚠️ The section is NAMED news and is deliberately not a news feed. Its
   * content is evergreen: what a variable is, how a loop runs, why an
   * algorithm is not a program. Exam dates and ministry decisions are
   * excluded on purpose — they go stale, aggregators republish them wrong,
   * and a wrong date on a teacher's own site costs more trust than the
   * traffic is worth. Programming does not change by decree.
   *
   * Every string here is written for two readers at once: a student skimming,
   * and a search engine deciding what this page is about. That is why the
   * headings are questions — «إيه هي الحلقة التكرارية» is what people type,
   * «الحلقات» is what nobody types.
   */
  news: {
    eyebrow: '06 / نيوز',
    title: 'نيوز',
    /** The `<h1>` on the index, and the strongest single ranking signal on it. */
    heading: 'البرمجة، مشروحة من الأول',
    subtitle: 'مقالات قصيرة في أساسيات البرمجة وعلوم الحاسب — بالعربي، وبأمثلة كود شغّالة.',
    /** Meta description for `/news`. ≤160 chars, same rule as a post's excerpt. */
    description:
      'مقالات في أساسيات البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية — المتغيرات والحلقات والدوال والمصفوفات، كل واحدة مشروحة بالعربي وبكود شغّال.',
    empty: 'لسه مفيش مقالات منشورة.',
    /** `{n}` is a whole number of minutes — see `readingMinutes`. */
    readingTime: 'قراءة {n} دقيقة',
    published: 'اتنشر',
    updated: 'اتعدّل',
    backToList: 'كل المقالات',
    /** The in-article CTA. `{course}` is the related course's title. */
    relatedTitle: 'عايز تتعلم ده كامل؟',
    relatedBody: 'الكلام اللي فوق ده مقدّمة. الشرح الكامل بالفيديو والتمارين والاختبارات في «{course}».',
    relatedCta: 'افتح الكورس',
    /** Shown instead of `related*` when the article has no course attached. */
    fallbackTitle: 'ابدأ من الأول',
    fallbackBody: 'لو المقالة دي عجبتك، المنهج كامل مرتّب بالصف والمسار — والكورسات كلها مجانية.',
    fallbackCta: 'اتفرّج على الكورسات',
    /** `aria-label` on the article list. */
    listLabel: 'قائمة المقالات',
  },

  quiz: {
    /** The two papers of a course exam, as the student sees them named. */
    papers: { original: 'الامتحان الأصلي', improvement: 'امتحان التحسين' },
    hint: 'راجع إجاباتك كويس قبل ما تسلّم.',
    start: 'ابدأ الامتحان',
    /**
     * Shown inside the gate dialog when creating the attempt fails.
     *
     * `StartAttemptButton` used to wrap the call in `try/finally` with no
     * `catch`, so a 4xx/5xx/offline rejection was swallowed: the spinner
     * stopped, the dialog stayed open, and absolutely nothing else happened.
     * From the student's side that is «بضغط ابدأ وما بيحصلش حاجة» — the exact
     * complaint the retry hook in `lib/use-error-retry.ts` was written for,
     * arriving through a path that never reached an error boundary because
     * the rejection never propagated.
     *
     * It names the likeliest real cause (connection) instead of blaming them,
     * and it does not promise the attempt was not created — the server may
     * have created one and lost the response, and «ابدأ» will resume it.
     */
    startFailed: 'مقدرناش نبدأ الامتحان دلوقتي. اطمن، مفيش محاولة اتحرقت — اتأكد من النت وجرّب تاني.',
    resume: 'كمّل امتحانك',
    attemptNo: 'المحاولة رقم {n}',
    /** Stated on the intro of every quiz that is not an improvable exam. */
    singleAttempt: 'محاولة واحدة',
    /** …and on the ones that are. */
    twoAttempts: 'محاولة + تحسين',
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
    /** Takes the place of `submitConfirmAction` on the confirm button for as
     *  long as the submission is actually in flight. Deliberately the same
     *  shape as `saving` above: «بيتحفظ…» is the pending form a student has
     *  already met dozens of times on the autosave label by the time they
     *  reach this button, so «بيتسلّم…» is recognised rather than read. Same
     *  single U+2026 ellipsis as every other pending string in this file —
     *  three separate dots render with the wrong spacing in Arabic. */
    submitting: 'بيتسلّم…',
    alreadySubmitted: 'الامتحان ده اتسلّم خلاص.',
    /** The other confirm in the runner, and the one the student never asked
     *  for: on Android the back gesture is how you leave any screen, so on a
     *  running attempt it is intercepted and asked about instead of obeyed
     *  (`quiz-runner.tsx`). The body states the two facts that actually decide
     *  the answer — the answers are already saved, and the clock does NOT stop
     *  while you are away — because a bare «متأكد؟» tells a student something
     *  is at stake without saying what, and here it is minutes of a paper they
     *  cannot pause. */
    leaveTitle: 'متأكد إنك عايز تسيب الامتحان؟',
    leaveBody: 'إجاباتك محفوظة، بس الوقت هيفضل ماشي وإنت بره. تقدر ترجع تكمّل من نفس المكان قبل ما الوقت يخلص.',
    /** The safe answer, and the one the dialog focuses — same rule as
     *  `submitCancel`: the way back into the exam takes zero thought. */
    leaveStay: 'كمّل الامتحان',
    leaveConfirm: 'سيب الامتحان',
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
    noAttemptsLeft: 'خلاص امتحنت الامتحان ده',
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
    /** Replaces `start` on an improvable exam the student has already sat. */
    improveExam: 'ادخل امتحان التحسين',
    /** The improvement sitting exists but has been used. */
    improveUsed: 'استعملت محاولة التحسين',
    /** Marks which of two sittings is the one that counts. */
    counts: 'الدرجة المحتسبة',
    /** The review screen's filter, and what it says when nothing is wrong. */
    wrongOnly: 'وريني غلطاتي بس',
    showAll: 'كل الأسئلة',
    wrongCount: 'غلطت في {n} من {total}',
    allCorrect: 'مفيش ولا غلطة — ورقة كاملة',
    scoreBandExcellent: 'أداء ممتاز',
    scoreBandGood: 'أداء كويس',
    scoreBandNeedsWork: 'محتاج تراجع الدرس تاني',
    reviewLockedDuringBody: 'هتقدر تراجع إجاباتك بعد ما تسلّم المحاولة.',
    unansweredChipLabel: 'سؤال {n}',
  },
  /**
   * The gate a student passes through before their FIRST question, and the
   * different one they pass through before an improvement sitting.
   *
   * Both say the same load-bearing fact in different words: the result is
   * recorded and it is not coming off. That sentence is the whole reason this
   * screen exists — a student who reads it and presses on cannot later be
   * surprised by their own transcript.
   */
  examGate: {
    title: 'قبل ما تبدأ',
    intro: 'خد دقيقة تقرا ده كويس.',
    focusTitle: 'ركّز في كل سؤال',
    focusBody: 'الامتحان بيتفتح مرة واحدة، ومفيش رجوع بعد ما تسلّم.',
    recordedTitle: 'درجتك هتتسجّل',
    recordedBody: 'النتيجة بتتحفظ في سجلك وبتفضل فيه — مش بتتمسح ولا بتترجع.',
    onceTitle: 'محاولة واحدة بس',
    onceBody: 'الكويز ده ليه محاولة واحدة. حلّه وانت مركّز.',
    onceExamBody: 'دي محاولتك الأصلية. بعدها ليك محاولة تحسين واحدة، وأعلى درجة هي اللي بتتحسب.',
    timedBody: 'معاك {minutes} دقيقة من أول ما تضغط ابدأ، والوقت بيمشي حتى لو قفلت الصفحة.',
    untimedBody: 'مفيش وقت محدد، بس المحاولة بتفضل مفتوحة لحد ما تسلّمها.',
    agree: 'فاهم، ابدأ الامتحان',
    cancel: 'مش دلوقتي',

    improveTitle: 'امتحان التحسين',
    improveIntro: 'قبل ما تدخل، في حاجتين لازم تكون عارفهم.',
    improveDifferentTitle: 'الأسئلة هتكون مختلفة',
    improveDifferentBody: 'ده امتحان تاني بأسئلة غير اللي امتحنتها. ذاكر الأول، مش هينفع تعتمد على اللي فات.',
    improveSafeTitle: 'درجتك الحالية في أمان',
    improveSafeBody: 'أعلى درجة في الاتنين هي اللي بتتحسب. لو جبت أقل، درجتك الأولى هي اللي هتفضل.',
    improveOnceBody: 'ودي فرصتك الوحيدة للتحسين — مفيش محاولة تالتة.',
    improveAgree: 'ذاكرت، ابدأ التحسين',
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
  /**
   * The markdown twin of every public page — what an AI assistant reads when
   * it fetches this site with `Accept: text/markdown` instead of rendering
   * our JavaScript. See `apps/web/lib/agents/markdown-render.ts`.
   *
   * ⚠️ These strings are read by a MACHINE and then quoted to a STUDENT, which
   * makes them ordinary user-facing copy with an unusually long echo: a
   * sentence here can come back out of ChatGPT months later, in front of a
   * parent deciding whether to pay. `contentNote` in particular is the only
   * thing standing between an assistant and confidently telling someone the
   * lessons are free to read — it is a factual correction, not a disclaimer,
   * and it must not be softened into marketing.
   *
   * Everything else on those pages comes from the namespaces above; only the
   * few labels the markdown rendering ADDS live here.
   */
  agents: {
    courseOutline: 'محتوى الكورس',
    faqTitle: 'الأسئلة الشائعة',
    metaYear: 'الصف',
    metaSubject: 'المادة',
    metaTrack: 'المسار',
    metaSystem: 'النظام',
    metaLessons: 'عدد المحاضرات',
    sourcePage: 'الصفحة الأصلية',
    agentIndex: 'فهرس الوكلاء',
    publicApi: 'واجهة البيانات العامة',
    contentNote:
      'اللي معروض هنا هو الفهرس العام للكورسات. الدروس نفسها — الفيديو والملفات والاختبارات — محتاجة حساب طالب واشتراك في الكورس.',
  },

  /**
   * الخصوصية والشروط.
   *
   * ⚠️ كل جملة هنا بيان عن سلوك حقيقي للنظام، مش نص قانوني عام منقول.
   * قائمة البيانات مشتقة حرفياً من `StudentProfile` و`User` في
   * `schema.prisma`، وقائمة الأطراف التانية مشتقة من الـ CSP المنشورة فعلاً
   * على الإنتاج. لو حقل اتشال من السكيما أو دومين اتشال من الـ CSP، السطر
   * اللي بيقابله هنا بقى كذب — عدّله في نفس الـ PR.
   */
  legal: {
    privacyTitle: 'سياسة الخصوصية',
    privacyLead: 'إيه اللي بنجمعه منك، وليه، ومين بيشوفه.',
    termsTitle: 'شروط الاستخدام',
    termsLead: 'قواعد استخدام المنصة، مكتوبة بلغة تتقري.',
    updatedAt: 'آخر تحديث: أغسطس ٢٠٢٦',

    ownerTitle: 'مين اللي بيدير المنصة',
    ownerBody:
      'المنصة دي بيديرها ويشرف عليها أيمن أبو العلا شخصياً، مدرّس الحاسب الآلي وتكنولوجيا المعلومات. هو الجهة المسؤولة عن أي بيانات بتتجمع هنا.',
    ownerContactLabel: 'للتواصل بخصوص بياناتك:',
    ownerContactFallback:
      'تقدر توصلنا من أي حساب من حسابات التواصل المذكورة في آخر الصفحة.',

    collectTitle: 'البيانات اللي بنجمعها',
    collectAccount: 'بيانات الحساب',
    collectAccountBody:
      'الاسم والبريد الإلكتروني وكلمة السر. كلمة السر بتتخزّن مشفّرة ومحدش يقدر يقراها، ولا إحنا. ولو رفعت صورة شخصية للحساب، بتتخزّن عندنا لحد ما تشيلها أو تغيّرها.',
    collectProfile: 'بيانات الطالب',
    collectProfileBody:
      'الاسم الكامل، النوع، رقم الهاتف، المحافظة، اسم المدرسة (اختياري)، والنظام الدراسي والصف والمسار. دي بنستخدمها عشان نعرف نعرضلك الكورسات اللي تخص صفك ومسارك بالظبط.',
    collectParents: 'أرقام هواتف ولي الأمر',
    collectParentsBody:
      'حقلين اختياريين تماماً — تقدر تسيبهم فاضيين وتكمّل عادي. بنخزّنهم عشان نقدر نتواصل مع ولي الأمر بخصوص مستوى الطالب لو احتجنا، وللأمانة: لحد النهاردة مابنبعتلهمش أي حاجة ومابنستخدمهمش في أي غرض. لو مش مرتاح، سيبهم فاضيين.',
    collectProgress: 'تقدّمك في الدراسة',
    collectProgressBody:
      'المحاضرات اللي فتحتها وخلّصتها، مدة المشاهدة، ومحاولات الاختبارات ودرجاتها. ده اللي بيخلّي شريط التقدّم والنتايج شغّالين.',
    collectTechnical: 'بيانات تقنية',
    collectTechnicalBody:
      'الأجهزة اللي دخلت منها عشان تقدر تشوفها وتقفلها من الإعدادات، وسجلّ للعمليات الإدارية على المنصة.',

    neverTitle: 'حاجات مابنجمعهاش',
    neverBody:
      'مابنطلبش الرقم القومي، ولا أي بيانات بنكية أو أرقام كروت، ولا صور مستندات رسمية. المنصة مجانية ومفيش أي مدفوعات فيها أصلاً.',

    shareTitle: 'مين تاني بيشوف البيانات',
    shareBody: 'مابنبيعش بياناتك ومابنأجرهاش لحد، ومابنستخدمهاش في إعلانات. الأطراف التانية الوحيدة اللي ليها علاقة بالموقع:',
    shareCloudflare:
      'كلاودفلير — بتقدّم الموقع وبتحميه، وبتجمع إحصائيات زيارات مجمّعة من غير كوكيز تتبّع.',
    shareYoutube:
      'يوتيوب — الفيديوهات متشغّلة من نطاق youtube-nocookie، وهو الوضع اللي بيمنع يوتيوب من حط كوكيز تتبّع عليك قبل ما تشغّل الفيديو.',
    // ⚠️ ده مش بند تجميلي. Clarity طرف تالت بيستقبل **تسجيل** لحركة الاستخدام
    // على الشاشة، مش أرقام مجمّعة — فمن غير السطر ده الصفحة بتبقى بتقول حاجة
    // مش حقيقية. لو التسجيل اتقفل يومًا، السطر ده يتشال معاه.
    shareClarity:
      'مايكروسوفت كلاريتي — بتسجّل حركة الاستخدام على الصفحات (الدوس والتمرير ومكان الوقوف) عشان نعرف إيه اللي مش واضح ونصلّحه. التسجيل بيخفي محتوى الشاشة الحسّاس، وصفحات الإدارة مستثناة منه تمامًا.',
    shareHosting: 'السيرفر اللي المنصة شغّالة عليه، وبياناتها متخزّنة فيه.',

    cookiesTitle: 'الكوكيز',
    cookiesBody:
      'بنستخدم كوكيز ضرورية: واحدة بتفضّلك مسجّل دخول، وواحدة بتحمي الفورمات من التزوير. وفيه كوكيز من مايكروسوفت كلاريتي بتفرّق بين الزيارة والتانية عشان إحصائيات الاستخدام. كلها كوكيز خاصة بالموقع ده لوحده — مفيش كوكيز إعلانات ولا كوكيز بتتبعك عبر مواقع تانية.',

    rightsTitle: 'حقوقك',
    rightsBody:
      'تقدر في أي وقت تشوف بياناتك وتعدّلها من صفحة الملف الشخصي، وتقفل أي جهاز داخل بحسابك من الإعدادات. ولو عايز تمسح حسابك وكل البيانات المرتبطة بيه، ابعتلنا وهنعملها. البيانات بتفضل متخزّنة طول ما الحساب موجود.',

    minorsTitle: 'الطلبة تحت ١٨ سنة',
    minorsBody:
      'المنصة موجّهة لطلبة الثانوي، فأغلب المستخدمين قاصرين. لو انت ولي أمر وعايز تشوف بيانات ابنك أو تطلب مسحها، اتواصل معانا وهنستجيب.',

    changesTitle: 'لو الصفحة دي اتغيّرت',
    changesBody:
      'لو غيّرنا حاجة جوهرية في اللي بنجمعه أو بنستخدمه فيه، هنحدّث الصفحة دي وهنغيّر تاريخ آخر تحديث اللي فوق.',

    termsUseTitle: 'استخدام المنصة',
    termsUseBody:
      'الحساب شخصي — يخص طالب واحد. مشاركة بياناتك مع حد تاني بتعرّض الحساب للإيقاف. المنصة بتسجّل الأجهزة اللي بتدخل منها، وتقدر تشوفها كلها وتقفل أي واحدة منها من الإعدادات.',
    termsContentTitle: 'المحتوى',
    termsContentBody:
      'الفيديوهات والملفات والاختبارات كلها ملك أيمن أبو العلا. تقدر تستخدمها لمذاكرتك انت، بس مينفعش تعيد نشرها أو توزّعها أو تبيعها.',
    termsQuizTitle: 'الاختبارات',
    termsQuizBody:
      'كل كويز ليه محاولة واحدة، ودرجتها بتتسجّل في سجلك وبتفضل فيه. الاستثناء الوحيد هو الامتحان النهائي بتاع الكورس: ليه محاولة تحسين واحدة بأسئلة مختلفة، وأعلى درجة في الاتنين هي اللي بتتحسب.',
    termsAvailabilityTitle: 'التوفّر',
    termsAvailabilityBody:
      'بنحاول المنصة تفضل شغّالة طول الوقت، بس ممكن تقف لصيانة أو لظرف خارج عن إرادتنا. مفيش ضمان بتوفّر مستمر ١٠٠٪.',
    termsTerminationTitle: 'إيقاف الحساب',
    termsTerminationBody:
      'ممكن نوقف حساب لو اتخالفت الشروط دي — زي مشاركة الحساب أو إعادة نشر المحتوى. وتقدر انت كمان تطلب مسح حسابك في أي وقت.',

    seeAlsoPrivacy: 'اقرأ سياسة الخصوصية',
    seeAlsoTerms: 'اقرأ شروط الاستخدام',
    backHome: 'ارجع للرئيسية',
  },
} as const;

export type Copy = typeof copy;
