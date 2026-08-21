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
 *
 * ## Nothing here knows whether it is talking to a boy or a girl
 *
 * The platform never asks, and roughly half the students are girls — so
 * «ابدأ»، «اختار صفّك»، «إنت مشترك»، «متأكد إنك عايز تسلّم؟» were all
 * addressing the male half and telling the other half, in the first words they
 * read, that the screen was written for somebody else. Every student-facing
 * string is now written so both readings are the same spelling:
 *
 *   · actions become the masdar — «فتح الكورس»، «حفظ»، «تحميل المحاضرة»،
 *     «تسليم الامتحان»، «إرسال» — which is also what YouTube's Arabic button
 *     does with «اشتراك»;
 *   · anything with a voice becomes the inclusive plural — «نبدأ الكورس»،
 *     «نكمّل»، «نحاول تاني» — which is warmer than the imperative it replaced;
 *   · statements about the reader go nominal — «الدرس خلص»، «الامتحان مش متاح
 *     دلوقتي»، «مفيش رجوع بعد التسليم»;
 *   · placeholders drop the verb and name the field: «الاسم بالكامل»،
 *     «محافظتك»، «سؤالك هنا…».
 *
 * `copy/outreach.ts` sets the rule out in full and `outreach/compose.spec.ts`
 * carries a tripwire over the message pools. The `admin` namespaces are the
 * one exception and stay in the imperative: those screens have exactly one
 * reader, and he is «مهندس أيمن».
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
      'البرمجة وعلوم الحاسب صح مع المهندس أيمن أبو العلا: دروس فيديو، ملفات ومذكرات، وامتحانات على كل درس — بمسار مرتّب لطلبة البكالوريا المصرية.',
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
    contact: 'التواصل معانا',
    login: 'تسجيل الدخول',
    register: 'حساب جديد',
    dashboard: 'حسابي',
    path: 'مساري',
    // ── the signed-in shell ──────────────────────────────────────────────
    essentials: 'التأسيس',
    playground: 'تجربة الكود',
    devices: 'أجهزتي',
    account: 'الحساب',
    accountMenu: 'قائمة الحساب',
    /**
     * The VISIBLE word beside the hamburger on a phone — and it replaced
     * `openMenu`, which was an `aria-label` on a button whose only visible
     * content was three horizontal lines.
     *
     * On a phone this control is the ONLY way to «التأسيس», «تجربة الكود»,
     * «نتائجي» and the course list, and nothing on any screen said so. A
     * hamburger is a learned convention and this audience has explicitly not
     * learned it: «العلامة اللي فوق على اليمين دي… أعلّم عليها بشكل كويس إن هو
     * يضغط عليها يلاقي فيها شوية أوامر». A label costs about forty pixels and
     * removes the guess — and it doubles as the accessible name, so a screen
     * reader now reads exactly what is on the screen rather than a second
     * string that has to be kept in step with it.
     *
     * «القائمة», not «المزيد» and not an ellipsis: it names what is inside
     * rather than promising unspecified more.
     */
    menuLabel: 'القائمة',
    logout: 'تسجيل الخروج',
    loggingOut: 'جارٍ الخروج…',
    logoutFailed: 'مقدرناش نسجّل خروجك. نحاول تاني.',
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
    /**
     * ⚠️ Distinct from `openMenu`, and it was not. Both read «فتح القائمة»,
     * on two different controls that open two different things — the desktop
     * rail's expand toggle and the phone's navigation drawer. Anything
     * navigating by accessible name (a screen reader's control list, voice
     * control, a Playwright `getByRole`) saw two identical buttons and could
     * not say which was which.
     */
    expandRail: 'فتح شريط التنقّل',
    backToSite: 'الموقع الرئيسي',
    /** The marketing nav's signed-in state. A student who is already in does
     *  not need to be sold an account — they need the way back to their own
     *  screen, named the same thing the rail names it. */
    continueStudying: 'نكمّل المذاكرة',
  },
  theme: {
    toggle: 'تبديل المظهر',
    light: 'فاتح',
    dark: 'داكن',
    system: 'حسب النظام',
  },
  onboarding: {
    title: 'نكمّل بيانات حسابك',
    subtitle: 'شوية معلومات سريعة عشان نعرف نوريك الكورسات اللي تخصّك إنت بس',
    /** Prefix, rendered as `{identityGreeting} {name}` — the name comes from
     *  the session, so it can't be baked into one string here. */
    identityGreeting: 'أهلاً يا',
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
     * On the guardian's-phone step, where the ask is largest — and larger than
     * it used to be, because the number is now required rather than skippable.
     * A demand with no reason attached is the thing that got this form flagged
     * in the first place (see `privacyNote` above).
     *
     * It reads as ONE reason and one promise, in that order, because that is
     * the order the student asks them in: what is this for, and what else will
     * you do with it.
     *
     * The words are unchanged; where they sit is not. This was a bare grey
     * `<p>` above the input — the shape of page furniture — and it was reported
     * as MISSING by the person who commissioned it, which is the only review a
     * disclosure really gets. It is a `<FieldNote>` now: tinted panel, icon,
     * `aria-describedby` on the field itself. Nothing on this step reads as
     * decoration any more, so nothing on it gets skipped as decoration.
     */
    parentPhonesWhy:
      'الرقم ده عشان نقدر نتواصل مع ولي أمرك عن مستواك لو احتجنا. مابنستعملهوش في أي حاجة تانية.',
    fullName: 'الاسم الكامل',
    fullNamePlaceholder: 'الاسم بالكامل',
    gender: 'النوع',
    /**
     * The blank option, and it must not repeat its own label.
     *
     * It said «النوع» under a `<label>` reading «النوع» — so the closed select
     * showed the same two words twice, one above the other, and neither of
     * them said anything about what to do. `governoratePlaceholder`
     * («محافظتك») and `schoolStreamPlaceholder` («مدرسة عام ولا لغات؟») were
     * already written as prompts; these two were the leftovers.
     */
    genderPlaceholder: 'اختار',
    genderMale: 'ذكر',
    genderFemale: 'أنثى',
    genderError: 'لازم نحدد النوع',
    phone: 'رقم الهاتف',
    // `مثال:` is load-bearing, not decoration. A bare `01012345678` is a
    // well-formed Egyptian number, so in an empty field it reads as a value
    // that is already filled in — students hit "احفظ" and got "رقم الهاتف
    // مطلوب" on a field that looked complete.
    phonePlaceholder: 'مثال: 01012345678',
    governorate: 'المحافظة',
    governoratePlaceholder: 'محافظتك',
    schoolName: 'اسم المدرسة',
    /*
     * Was the literal word «اختياري», which stopped being true when the field
     * became required — a placeholder that tells a student they may skip a
     * field the form will then refuse is worse than no placeholder at all.
     * `مثال:` for the same reason `phonePlaceholder` carries it: without it a
     * plausible school name in an empty field reads as already filled in.
     */
    schoolNamePlaceholder: 'مثال: مدرسة النصر الثانوية',
    /**
     * The student's own «لغات ولا عام», the half that was missing from the
     * split `copy.stream` already describes on a course. The two option
     * labels come from `copy.stream.general` / `.languages` rather than being
     * retyped here, so a student picking «لغات» and a course badged «لغات»
     * cannot end up spelled differently.
     */
    schoolStream: 'مدرستك',
    schoolStreamPlaceholder: 'مدرسة عام ولا لغات؟',
    schoolStreamError: 'لازم نحدد نوع مدرستك',
    system: 'النظام الدراسي',
    systemPlaceholder: 'النظام الدراسي',
    year: 'الصف الدراسي',
    /** Same correction as `genderPlaceholder` — it repeated its own label. */
    yearPlaceholder: 'اختار صفّك',
    track: 'المسار',
    trackPlaceholder: 'المسار',
    subject: 'المادة',
    electiveSubject: 'المادة الاختيارية',
    electiveSubjectPlaceholder: 'المادة الاختيارية',
    /**
     * The system, the track and the subject, stated instead of asked.
     *
     * They were three dropdowns with one right answer each — this platform is
     * البكالوريا / مسار الهندسة وعلوم الحاسب / البرمجة and nothing else — plus
     * a cascade of hide-and-clear rules to keep them consistent with one
     * another. The year is the only one of the four that varies between
     * students, so it is the only one still asked for.
     *
     * ⚠️ NOT rendered during sign-up any more, and that is a deliberate
     * retreat rather than a cleanup left half-done. Stating the three facts was
     * meant to reassure a student who expected to pick a track; what it
     * actually did was put «النظام الدراسي / مسار الهندسة وعلوم الحاسب /
     * المادة» in front of someone who had never asked about any of them, on the
     * screen where they have the least patience for reading — «مش عايز الكلمة
     * دي وأنا بسجل دخول». A question nobody asked does not need an answer.
     *
     * They survive here because `/settings/section` still renders them, and
     * there the reassurance is load-bearing: that page exists to CHANGE the
     * year, so "and everything else stays as it is" is the thing a student
     * about to touch it wants to know.
     */
    fixedSectionTitle: 'الباقي إحنا عارفينه',
    fixedSystem: 'البكالوريا المصرية',
    fixedTrack: 'مسار الهندسة وعلوم الحاسب',
    fixedSubject: 'البرمجة وعلوم الحاسب',
    fixedSectionHint:
      'المنصّة دي للبكالوريا بس، ولمادة البرمجة تحديدًا — فمش هنسألك على نظام ولا مسار ولا مادة.',
    /**
     * «ولي الأمر», not «الأب». The step it sits on has been called «تليفون ولي
     * الأمر» since the mother's number stopped being asked for, so the field
     * under it naming a father was the only thing on the screen still assuming
     * which parent answers the phone — and for a student raised by one, it is
     * a question with no true answer. The column stays `father_phone`; that is
     * storage, and nobody reads it.
     */
    fatherPhone: 'رقم تليفون ولي الأمر',
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
    submit: 'حفظ ونكمّل',
    submitPending: 'جارٍ الحفظ…',
    submitError: 'مقدرناش نحفظ بياناتك. مراجعة سريعة ونحاول تاني.',
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
      'المشكلة عندنا إحنا مش عندك، وحسابك اتعمل تمام ومحصلش أي حاجة له. دقيقة واحدة ونجرّب تاني — والباقي بيكمّل من نفس المكان.',
  },
  /**
   * «أهلاً بيك» — the screen between finishing onboarding and the dashboard,
   * whose whole job is to offer the WhatsApp channel at the one moment the
   * student has nothing else in hand.
   */
  welcome: {
    /**
     * «يا بطل» was here, and it greeted half the students on the platform as
     * somebody else — the account form never asks whether the person filling
     * it in is a boy or a girl, and this is the first sentence they read. The
     * same rule the outreach pools are written under; `copy/outreach.ts` sets
     * it out in full.
     */
    title: 'أهلاً وسهلاً 👋',
    /**
     * The same greeting with the student's own first name in it, used whenever
     * the session has one — which is every real sign-up. `title` survives for
     * the case it does not.
     *
     * The dashboard they are one press away from opens «أهلاً يا {name}». This
     * screen greeted them as nobody in particular and then handed them over to
     * a page that knew who they were, which reads as two different products
     * across one navigation.
     */
    titleNamed: 'أهلاً يا {name} 👋',
    /** Above the greeting: how much is left, in two words. */
    eyebrow: 'آخر خطوة',
    /**
     * Says what the channel is FOR, not that it exists. «تابعنا على الواتس»
     * is an ask; «اللي بيتنزل هتعرفه والموقع مقفول» is a reason — and it is
     * the true one: a student who never joins only finds out a lesson went up
     * by opening the site, which is the habit the channel replaces.
     *
     * SHORTER than it was. It used to spell the channel's whole case out here
     * — «فاضل حاجة واحدة: الاشتراك في قناة الواتساب، عشان أي درس جديد أو ميعاد
     * امتحان يوصلك على طول والموقع مقفول» — directly above a card whose own
     * two lines say the same thing again. One argument, made twice, on the
     * screen with the least patience for reading. The card keeps the argument;
     * this keeps the news.
     */
    body: 'حسابك جاهز. فاضل حاجة واحدة بس.',
    /**
     * The three-stop rail on the band.
     *
     * Numbered because it genuinely IS a sequence and the student has just
     * walked two thirds of it — «حسابك جاهز، فاضل حاجة واحدة» is exactly this
     * shape, said as a picture instead of a sentence. Two ticks and one open
     * stop is also the only thing on the screen that answers "how much more of
     * this is there", which is the question a sign-up flow gets asked most.
     */
    stepAccount: 'الحساب اتعمل',
    stepProfile: 'بياناتك اتحفظت',
    stepStart: 'نبدأ الدراسة',
    /** The accessible name for the rail — the ticks are decorative. */
    stepsLabel: 'خطوات إنشاء الحساب',
    continue: 'يلا نبدأ',
  },

  auth: {
    login: {
      title: 'تسجيل الدخول',
      subtitle: 'نكمّل من المكان اللي وقفنا عنده.',
      /**
       * Shown above the form ONLY when a validated `?next=` is present — i.e.
       * the visitor was sent here by the gate rather than arriving on their
       * own. It answers the question a bounced visitor is actually asking
       * ("why am I on a login page?"), and its absence for a direct visit is
       * the point: nobody who chose to sign in needs to be told to.
       */
      continueNotice: 'تسجيل الدخول عشان نكمّل',
    },
    register: {
      title: 'إنشاء حسابك',
      subtitle: 'دقيقة واحدة وتكون جوه أول محاضرة.',
    },
    fields: {
      name: 'الاسم الكامل',
      /**
       * The account's identity now. The label says «موبايل» rather than
       * «هاتف» because that is the word a student uses about the thing in
       * their hand — «رقم الهاتف» reads like a form at a government office.
       */
      phone: 'رقم الموبايل',
      /**
       * Digits ONLY — no «مثال:» prefix, deliberately.
       *
       * The input is `dir="ltr"` so a typed number reads correctly, but a
       * placeholder that mixes an Arabic word with Latin digits is a bidi run
       * the browser lays out from the other edge: the hint sat right-aligned
       * and then the student's own typing appeared left-aligned, so the field
       * visibly jumped the moment they touched it. The label already says
       * which number is wanted; the placeholder only has to show the shape.
       */
      phonePlaceholder: '01012345678',
      email: 'البريد الإلكتروني',
      /**
       * The parenthetical is load-bearing, not decoration. An email field
       * sitting between a phone and a password reads as required no matter
       * what the schema says, and a student without an address will invent
       * one rather than skip it — which is worse than leaving it blank,
       * because an invented address is indistinguishable from a real one.
       */
      emailOptional: 'البريد الإلكتروني (اختياري)',
      emailOptionalHint: 'مش لازم. المنصة مابتبعتش إيميلات — الرقم هو اللي بيتم الدخول بيه.',
      /**
       * ONE field on the sign-in form, because a student cannot reliably
       * classify their own account: someone who signed up by phone and later
       * added an email owns both, and a Google student owns an address they
       * never typed.
       */
      identifier: 'رقم الموبايل أو البريد الإلكتروني',
      password: 'كلمة المرور',
      confirmPassword: 'تأكيد كلمة المرور',
    },
    actions: {
      login: 'دخول',
      loginPending: 'بندخّلك…',
      register: 'إنشاء الحساب',
      registerPending: 'بنجهّز حسابك…',
    },
    switch: {
      noAccount: 'لسه معملتش حساب؟',
      createAccount: 'نعمل واحد دلوقتي',
      haveAccount: 'عندك حساب؟',
      login: 'الدخول من هنا',
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
      google: 'المتابعة بحساب جوجل',
    },
    /** The dark showcase panel beside the form on /login and /register. */
    aside: {
      eyebrow: 'منصة أ. أيمن أبو العلا',
      title: 'حسابك هو مكان مذاكرتك كله',
      body: 'الكورسات، الدروس اللي خلصت، درجاتك في كل اختبار، وآخر حتة في المذاكرة — كله بيستناك جوه.',
      point1: 'كل كورساتك في صفحة واحدة',
      point2: 'المشغّل بيفتكر آخر ثانية في الفيديو',
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
      register: 'مقدرناش نعمل الحساب. البيانات محتاجة مراجعة، وبعدها نحاول تاني.',

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
      loginBanned: 'حسابك موقوف دلوقتي، والدخول مقفول.',

      /**
       * The Google round trip came back refused.
       *
       * Before this existed, `signInWithSocial` set no `errorCallbackURL`, so
       * Better Auth fell back to `${baseURL}/error` — i.e. the student left the
       * site, authenticated with Google, and landed on
       * `/api/auth/error?error=account_not_linked`: the library's own bare
       * English page, on the API path, with no nav and no way back. Measured
       * from `callback.mjs:163` + `oauth2/errors.mjs:12`.
       *
       * `account_not_linked` is the one that actually happens here, and it has
       * a specific cause worth naming rather than apologising for: the email
       * already has a PASSWORD account. Better Auth refuses to link a social
       * login onto a local account whose `emailVerified` is false, and this
       * platform has no email-verification flow at all, so that is every
       * account created with an email and a password.
       *
       * So the message tells them the one thing that gets them in — use the
       * password — instead of describing a failure they cannot act on.
       */
      socialAccountNotLinked:
        'الإيميل ده مسجّل عندنا بكلمة سر. الدخول بالإيميل وكلمة السر من فوق، مش بجوجل.',
      /** Anything else the provider round trip can come back with. */
      socialGeneric: 'مقدرناش نكمّل الدخول بجوجل. نجرّب تاني، أو ندخل بالإيميل وكلمة السر.',
      /** Prefixes the admin's own words. `{reason}` is operator-authored. */
      loginBannedReason: 'السبب: {reason}',
      loginBannedContact: 'ولو فيه غلط، كلمة للمدرّس وهيتظبط.',
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
    retry: 'نحاول تاني',
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
    body: 'الصفحة دي محتاجة اتصال. نجرّب تاني أول ما النت يرجع — مفيش حاجة ضاعت.',
    retry: 'نحاول تاني',
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
      'نتك شغال — المشكلة عندنا إحنا. دي بتحصل لتانية وقت التحديث، وبترجع لوحدها. شوية ونحاول تاني.',
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
      body: 'المشكلة عندنا إحنا مش عندك. حسابك وكل اللي ذاكرته متسجّل زي ما هو ومامسّهوش حاجة. نجرّب تحميل الصفحة تاني، ولو فضلت واقفة نرجع للحساب ونكمّل من مكان تاني.',
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
      body: 'المشكلة عندنا إحنا مش عندك. نجرّب تحميلها تاني، ولو فضلت زي ما هي نرجع للرئيسية — باقي الموقع شغّال عادي.',
    },

    /**
     * /login and /register. Same visitor as `site`, one screen later and
     * with a password half-typed, so the one thing worth saying that the
     * public wording does not say is that nothing happened to the account.
     */
    auth: {
      title: 'مقدرناش نفتح الصفحة دي',
      body: 'المشكلة عندنا إحنا مش عندك، وحسابك زي ما هو — مفيش حاجة اتغيّرت فيه. نجرّب تاني بعد ثانية.',
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
      body: 'المشكلة عندنا إحنا مش عندك، وحسابك وبياناتك مامسّهمش حاجة. نحمّل الصفحة من الأول، ولو فضلت واقفة شوية ونجرّب تاني.',
      /**
       * The secondary action, and the only string in this namespace that
       * cannot borrow a label from the chrome — there is no chrome. It says
       * "load the whole page again", not «حاول تاني», precisely so it does
       * not read as a duplicate of the retry button beside it.
       */
      reload: 'تحميل الصفحة من الأول',
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
      body: 'المشكلة عندنا إحنا مش عندك، وحسابك وكل اللي ذاكرته زي ما هو. نجرّب تاني، ولو فضلت واقفة نرجع للصفحة الرئيسية وندخل من هناك.',
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
      body: 'يمكن الرابط قديم أو فيه حرف ناقص، أو الصفحة اتشالت. والرجوع للرئيسية أو للكورسات المتاحة من هنا.',
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
      body: 'يمكن الدرس أو الكورس ده اتشال أو الرابط قديم. حسابك وكل اللي ذاكرته زي ما هو — نرجع للحساب ونكمّل من هناك.',
      cta: 'حسابي',
    },

    /**
     * Staff. They are far more likely than a student to have reached this by
     * an id that was deleted from under them, so the wording names that case
     * instead of guessing at a typo.
     */
    admin: {
      title: 'الصفحة دي مش موجودة',
      body: 'يمكن العنصر ده اتمسح أو الرابط اتغيّر. نرجع للوحة التحكم ونجرّب من هناك.',
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
      body: 'الرابط ده مش موجود على المنصة. يمكن يكون قديم أو مكتوب غلط — نرجع للرئيسية ونبدأ من هناك.',
      cta: 'الرئيسية',
    },
  },
  code: {
    copy: 'نسخ الكود',
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
      revoke: 'قفل الجهاز',
      revokePending: 'جارٍ القفل…',
      revokeCurrentConfirm: 'ده الجهاز اللي إنت عليه دلوقتي — لو قفلته هيتسجّل خروجك فورًا. تمام؟',
      revokeError: 'مقدرناش نقفل الجهاز. نحاول تاني.',
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
      'لأول مشروع يتكتب بإيدك لوحدك.',
      'لآخر تمرين من غير مساعدة.',
      'لحد اليوم اللي الحفظ ميبقاش له لزوم.',
    ],
    heroLead:
      'منهج البرمجة وعلوم الحاسب كامل، ماشي بترتيب واحد ثابت: فهم الفكرة، وكتابتها كود بإيدك، وامتحان عليها في نفس الجلسة.',
    ctaPrimary: 'حساب مجاني في دقيقة',
    ctaSecondary: 'نشوف الكورسات الأول',
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
      'الشبكة العصبية اللي شغّالة ورا أي نموذج ذكاء اصطناعي مش أكتر من عُقد وأوزان بتتظبط بالتكرار. نفس المنطق ده بالظبط بيتكتب بإيدك في الكورس، سطر ورا سطر.',
    tracksEyebrow: '02 / المنهج',
    tracksTitle: 'مربوط بالمنهج، سؤال بسؤال',
    tracksLead:
      'كل درس معلّق على مكانه في نظام البكالوريا: صفّه ومساره ومادته. يعني المذاكرة في اللي بيتسأل عليه فعلًا، مش في اللي حواليه.',
    featuresEyebrow: '03 / الطريقة',
    featuresTitle: 'إحنا بنشتغل إزاي',
    feature1Title: 'كل فكرة على اللي قبلها',
    feature1Body: 'مفيش قفزات. المفهوم الجديد بيتبني على اللي فهمته قبله، بأمثلة كود شغّالة قدامك.',
    feature2Title: 'تصحيح في نفس اللحظة',
    feature2Body: 'الغلط بيبان والسؤال لسه في الدماغ، ومعاه مراجعة بتوضّح الإجابة الصح وسببها.',
    feature3Title: 'تقدّمك متسجّل لوحده',
    feature3Body: 'كل درس بيتقفل بيتحفظ، فالمكان اللي وصلت له والحتة اللي محتاجة رجعة باينين من غير تفكير.',
    instructorEyebrow: '04 / المُحاضر',
    instructorTitle: 'مين اللي واقف قدام الكاميرا',
    instructorName: 'أ. أيمن أبو العلا',
    instructorBody:
      'مهندس بيدرّس البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية. شغله إنه يفكّك الفكرة الصعبة لأجزاء صغيرة، ويخلّيك كاتب كود من أول محاضرة.',
    finalTitle: 'نبدأ إمتى؟',
    finalLead: 'الحساب بياخد دقيقة، وأول محاضرة مفتوحة قدامك على طول ومن غير فلوس.',
    finalCta: 'نبدأ دلوقتي',

    // tracks (code-editor cards, one per track)
    tracksSelectEyebrow: 'المسارات',
    tracksSelectTitle: 'البداية من المكان الصح',
    tracksSelectLead: 'بداية من الصفر ولا مذاكرة منهج؟ الاتنين ليهم مسار مستنيك.',
    trackEssentialsTag: 'تمهيد · ESSENTIALS',
    trackEssentialsTitle: 'التأسيس',
    trackEssentialsBody: 'المصطلحات والأفكار اللي بتتكرر في أي لغة برمجة، في جلسة واحدة قصيرة.',
    trackEssentialsCta: 'نبدأ من هنا',
    trackYear1Tag: 'المسار · 01',
    trackYear1Title: 'الصف الأول',
    trackYear1Body: 'كورسات أولى بكالوريا: شرح المنهج، تمارين، ومراجعة قبل كل امتحان.',
    trackYear1Cta: 'كورسات أولى',
    trackYear2Tag: 'المسار · 02 — نشط',
    trackYear2Title: 'الصف الثاني',
    trackYear2Body: 'كورسات تانية بكالوريا: شرح المنهج، تمارين، ومراجعة قبل كل امتحان.',
    trackYear2Cta: 'كورسات تانية',

    // courses teaser
    coursesEyebrow: 'المكتبة',
    coursesTitle: 'نبدأ بكورس النهارده',
    coursesLead: 'كل كورس فيه شرح مسجّل، تمارين، واختبارات — مرتّب بالصف والمسار.',
    coursesCta: 'كل الكورسات',
    courseFree: 'مجاني بالكامل',
    courseOpen: 'دخول الكورس',

    // FAQ
    faqEyebrow: 'أسئلة متكررة',
    faqTitle: 'اللي بيتسأل قبل التسجيل',
    faq1Q: 'مش عارف حاجة عن البرمجة خالص — أبدأ منين؟',
    faq1A: 'من مسار التأسيس. بيشرح المصطلحات والأفكار الأساسية الأول، وبعدين الكود نفسه بتمارين صغيرة بتكبر مع الوقت.',
    faq2Q: 'هتفرّج بس ولا هكتب بإيدي؟',
    faq2A: 'الكتابة من أول محاضرة. كل جزئية وراها تمرين، وفيه محرّر شغّال جوه المنصة للتجربة من غير تنزيل أي برنامج.',
    faq3Q: 'أعرف إزاي إن المعلومة وصلت فعلًا؟',
    faq3A: 'كل درس وراه اختبار قصير بيتصحّح فورًا، ونتايجك كلها بتتجمّع في صفحتك عشان المستوى يبقى باين رايح فين.',
    faq4Q: 'المنصة دي لمين بالظبط؟',
    faq4A: 'لطلبة البكالوريا المصرية اللي بياخدوا البرمجة وعلوم الحاسب — من اللي لسه بيبدأ لحد اللي بيجهّز للامتحان النهائي.',
    faq5Q: 'لو حصلت مشكلة في حسابي؟',
    faq5A: 'رسالة على واتساب أو من صفحة التواصل، والرد بيوصلك في نفس اليوم.',

    // interactive playground
    playEyebrow: 'محرّر مباشر',
    playTitle: 'كتابة. تشغيل. نتيجة.',
    playLead: 'المحرّر ده شغّال جوه الصفحة من غير أي تنصيب. أي تعديل في المثال، ودوسة على «تشغيل»، والنتيجة أو رسالة الخطأ بتطلع تحت على طول.',
    playRun: 'تشغيل الكود',
    playRunning: 'بيشتغل…',
    playReset: 'رجوع المثال',
    playConsole: 'Console — النتيجة',
    playEmpty: 'الكود بيتكتب هنا، ودوسة على «تشغيل الكود» والنتيجة بتطلع تحت.',
    playTimeout: 'الكود قعد كتير — غالبًا فيه حلقة مالهاش نهاية.',

    // footer
    footerTagline: 'البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية',
    footerRights: 'جميع الحقوق محفوظة © 2026',
    footerPages: 'الصفحات',
    footerHome: 'الرئيسية',
    footerRegister: 'إنشاء حساب',
    footerLogin: 'تسجيل الدخول',
    footerFollow: 'تابعنا',
    footerContact: 'التواصل معانا',
    footerCommunity: 'مجتمع الطلاب',
    footerYoutube: 'يوتيوب',
    footerInstagram: 'إنستجرام',
    footerTiktok: 'تيك توك',
    footerFacebook: 'فيسبوك',
    footerWhatsappChannel: 'قناة واتساب',
    footerFacebookGroup: 'جروب فيسبوك',
    footerWhatsapp: 'التواصل معانا على واتساب',

    // ---- "why learn here" — the two-column vertical marquee ----
    whyTitle: 'ليه تتعلم البرمجة مع',
    whyTitleAccent: 'المهندس أيمن؟',
    whyLead: 'كل حاجة هنا مبنية على إنك تجرّب بنفسك. التفرّج لوحده مش بيعلّم برمجة.',
    whyLeadSecondary:
      'ودروسك وتمارينك ونتايجك كلها في مكان واحد، ماشية خطوة ورا خطوة لحد المشروع الأخير.',
    whyListLabel: 'مميزات التعلم على المنصة',
    why1Title: 'من الصفر فعلًا',
    why1Body: 'مش مطلوب منك أي خلفية سابقة — أول محاضرة بتبدأ من أول مصطلح.',
    why2Title: 'كود من أول يوم',
    why2Body: 'كتابة وتشغيل بإيدك من أول درس، من غير انتظار لحد ما «الأساسيات تخلص».',
    why3Title: 'تمرين ورا كل فكرة',
    why3Body: 'كل جزئية وراها تدريب صغير بيثبّتها قبل ما تعدّي للي بعدها.',
    why4Title: 'مستواك قدامك',
    why4Body: 'اختبارات دورية ونتايج متجمّعة بتقولك إنت قوي فين وضعيف فين.',
    why5Title: 'مشروع بيتبني خطوة بخطوة',
    why5Body: 'تخرج من الكورس ومعاك مشروع شغّال بنيته إنت خطوة بخطوة.',
    why6Title: 'مراجعة قبل الامتحان',
    why6Body: 'مراجعة منظّمة لامتحانات الشهور والنهائي، بنفس أسلوب الأسئلة.',
    why7Title: 'على المنهج بالظبط',
    why7Body: 'كل درس معلّم بصفّه ومساره في نظام البكالوريا، فمفيش وقت ضايع.',
    why8Title: 'الفهم الأول',
    why8Body: 'الفكرة بتتشرح جت منين وليه، وبعد كده بتتكتب كود من الدماغ.',

    // ---- tracks / choose your year ----
    tracksSelectBadge: 'SELECT YOUR TRACK',

    // ---- interactive code lab ----
    playFile: 'playground.js',
    playLang: 'JS',
    playEditorLabel: 'editor',
    playExampleLabel: 'مثال جاهز',
    playHint: '⌘ / Ctrl + Enter',
    playClear: 'مسح النتيجة',
    playCopy: 'نسخ الكود',
    playCopied: 'اتنسخ ✓',
    playConsoleIdle: 'جاهز',
    playConsoleLines: 'سطر',
    playConsoleErrors: 'خطأ',
    playConsoleClear: 'مسح',
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
    aboutPageCta: 'الكورسات المتاحة',
    aboutChip1: 'شرح بالكود',
    aboutChip2: 'تمرين على كل درس',
    aboutChip3: 'اختبارات ومتابعة',

    // ---- extra FAQ rows ----
    faq6Q: 'أذاكر إزاي هنا؟',
    faq6A: 'كورس صفّك بيتمشي بالترتيب: فيديو، وبعده تمرين، وبعده اختبار قصير. الدرس ما بيتقفلش غير لما التلاتة يخلصوا.',
    faq7Q: 'هطلع من الكورس عارف إيه؟',
    faq7A: 'المتغيرات والدوال والشروط والحلقات والمصفوفات، وبعدين تطبيق على منهج صفّك لحد ما تبني مشروع كامل شغّال.',
    faq8Q: 'مش عارف يعني إيه متغيّر ولا دالة — أعمل إيه؟',
    faq8A: 'البداية من صفحة المصطلحات. اتناشر مصطلح بيتكرروا في أي لغة برمجة، كل واحد متشرح في سطرين بالعربي ومعاه اسمه بالإنجليزي زي ما هو في الكود.',
    faq9Q: 'كورسات صفّي ألاقيها فين؟',
    faq9A: 'فيه صفحة لكل صف — الأول والتاني والتالت بكالوريا — وفيها كورسات الصف ده بترتيبها. والدخول ليها من «كورسات» فوق.',
    faq10Q: 'لازم أنزّل برامج على جهازي عشان أكتب كود؟',
    faq10A: 'لأ، ولا برنامج واحد. المحرّر شغّال جوه المنصة نفسها، والكتابة والتشغيل من المتصفح على طول.',
  },
  years: {
    title: 'كورسات',
    year1: 'الصف الأول بكالوريا',
    year2: 'الصف الثاني بكالوريا',
    year3: 'الصف الثالث بكالوريا',
    filterAll: 'الكل',
    filterFree: 'المجاني بس',
    empty: 'لسه مفيش كورسات منشورة للصف ده.',

    /**
     * The count beside each subject heading on `/years/[year]`.
     *
     * Four forms, because Arabic has four and «١ كورسات» is the kind of
     * mistake a parent reads as "nobody checked this". `countFew` is the 3–10
     * plural and `countMany` the 11+ singular — see `courseCountLabel` in
     * `apps/web/lib/course-groups.ts`, which is where the rule lives and is
     * tested.
     */
    countOne: 'كورس واحد',
    countTwo: 'كورسين',
    countFew: 'كورسات',
    countMany: 'كورس',
  },
  essentials: {
    badge: 'WARM-UP',
    title: 'قبل أول سطر كود',
    leadBefore: 'المصطلحات اللي بتتكرر في أي لغة برمجة، كل واحد منهم في سطرين. تخلص كلها وتبقى',
    leadCode: 'ready = true',
    leadAfter: 'بجد.',
    listTitle: '١٢ مصطلح مفيش كود بيتفهم من غيرهم',
    listLead: 'تعريف واحد واضح لكل مصطلح — بالعربي، ومعاه اسمه بالإنجليزي زي ما هتلاقيه في أي كود.',

    /**
     * The published foundation course, shown above the glossary when one
     * exists — see `lib/foundation-courses.ts`. The section disappears
     * entirely when nothing matches, so this copy never describes an empty box.
     */
    courseBadge: 'نبدأ دلوقتي',
    courseTitle: 'الكورس التأسيسي، كامل على المنصة',
    courseLead:
      'مش مصطلحات وبس — دي المحاضرات نفسها بالترتيب، مجانية بالكامل، ومفتوحة من دلوقتي.',
    t1Ar: 'متغيّر',
    t1Body: 'اسم بيتحط فيه قيمة عشان تتستخدم بعدين، وتتغيّر في أي وقت.',
    t2Ar: 'دالة',
    t2Body: 'شغل مكتوب مرة واحدة تحت اسم، وبيتنادى كل ما يحتاج بدل ما يتعاد.',
    t3Ar: 'حلقة',
    t3Body: 'بتخلّي الكمبيوتر يكرّر نفس الخطوات لحد ما شرط معيّن يقف.',
    t4Ar: 'مصفوفة',
    t4Body: 'صف من القيم ورا بعض، كل واحدة ليها رقم مكانها تنادي بيه عليها.',
    t5Ar: 'شرط',
    t5Body: 'مفترق طرق في الكود: لو ده صح يروح هنا، وغير كده يروح هناك.',
    t6Ar: 'كائن',
    t6Body: 'حاجة ليها صفات وأفعال، وبياناتها كلها متجمّعة في مكان واحد.',
    t7Ar: 'نوع البيانات',
    t7Body: 'القيمة دي رقم ولا نص ولا صح/غلط — النوع بيحدّد إيه اللي ينفع يتعمل بيها.',
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
     * again". Hence a lookup framing rather than a sales one.
     */
    appEyebrow: '05 / التأسيس',
    appTitle: 'التأسيس',
    appSubtitle: 'المصطلحات اللي بتتكرر في أي لغة برمجة — ارجعلها في أي وقت.',
    appSearch: 'بحث عن مصطلح',
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
    open: 'فتح الكورس',
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
    identityMissingHint: 'صفّك ومسارك عشان نعرف نرتّب كورساتك.',
    identityMissingCta: 'نختار صفّك',
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
    start: 'نبدأ الكورس',
    resume: 'نكمّل',
    open: 'فتح الكورس',

    // ── the course page (/library/[slug]) ────────────────────────────────
    backToLibrary: 'كل الكورسات',
    outline: 'محتوى الكورس',
    /** `{n}` is the lesson's place in the WHOLE course, not in its section. */
    lessonIndex: 'المحاضرة {n}',
    /**
     * Stands where `lessonIndex` would, on the quiz row nested under a lecture.
     * A quiz has no number of its own — it belongs to the lecture above it, and
     * numbering it made a three-lecture course count up to five.
     */
    lessonQuiz: 'كويز المحاضرة',
    watch: 'مشاهدة',
    takeQuiz: 'دخول الامتحان',
    /**
     * The quiz has been sat already — one sitting, so there is nothing left to
     * start, only a result to look at.
     *
     * A noun, like its neighbours, and for the reason #175 made them nouns: an
     * imperative has to pick a gender in Arabic, and half the students reading
     * this are girls.
     */
    quizDone: 'نتيجتك',
    review: 'مراجعة',
    reread: 'مراجعة الدرس',
    lessonDone: 'خلصت',
    /**
     * The three words a row says about the student, and the reason the
     * progression lock could be removed at all.
     *
     * Before this, a row that was neither finished nor locked said NOTHING
     * about whether the student had been there — «خلصت» appeared on the
     * finished ones and the rest were bare. That was survivable only while the
     * padlock was doing the telling: the course was a run of locks with one
     * open row at the front, so "where am I" was answered by the shape of the
     * list. With every lecture open, the shape says nothing and the list has to
     * say it in words. «بس ابقى علّم عليها إن هو ما شافهاش.»
     *
     * ⚠️ They are STATE, not instruction: «لسه ماشوفتهاش» and not «شوفها». An
     * imperative has to pick a gender in Arabic and half the students reading
     * this are girls — the same rule `quizDone` above is written to.
     *
     * `lessonQuizNew` exists because «ماشوفتهاش» is the wrong verb for a paper:
     * you do not WATCH a quiz. It carries no object pronoun either, so it fits
     * a masculine «كويز» and a feminine «محاضرة» without inflecting.
     */
    lessonNew: 'لسه ماشوفتهاش',
    lessonStarted: 'لسه ما خلصتهاش',
    lessonQuizNew: 'لسه ما امتحنتش',
    lessonLocked: 'مقفول',
    exam: 'الامتحان النهائي',
    notEnrolledTitle: 'نبدأ الكورس عشان المحاضرات تتفتح',
    notEnrolledBody: 'الكورس مجاني بالكامل — دوسة على «نبدأ» وأول محاضرة بتتفتح على طول.',
    enrollCta: 'نبدأ الكورس',

    // ── a course with nothing in it yet ──────────────────────────────────
    /**
     * The state that produced «إزاي مفيش دروس؟ الوقت محاضرات صفر إزاي؟».
     *
     * A course is refused publication with zero published lessons
     * (`CourseService.setStatus`), so this is always something that happened
     * AFTER it went live: a section unpublished to be edited, or the last
     * lesson pulled. That is a normal thing for an instructor to do and it
     * lasts minutes — but for the student standing in front of it, a page
     * printing «0 محاضرة» over an empty outline and a dead button says
     * nothing at all about which of those it is.
     *
     * So it says the true thing («لسه ماتنشرش»), and it does NOT apologise or
     * offer a retry: nothing the student presses can change it, and a «حاول
     * تاني» that cannot succeed is worse than no button. What it offers
     * instead is the one thing that IS useful — the other courses.
     */
    emptyTitle: 'الكورس ده لسه فاضي',
    emptyBody:
      'المحاضرات لسه ماتنشرتش. أول ما تنزل هتلاقيها هنا على طول، ومش محتاج تعمل حاجة.',
    emptyCta: 'نشوف باقي الكورسات',
    /** The card's own CTA when the course has nothing to open. */
    emptyCardCta: 'لسه فاضي',

    // ── the locked-exam dialog ───────────────────────────────────────────
    /**
     * The ONE lock left in the product, so this dialog names it directly
     * instead of saying «المحاضرة دي لسه مقفولة» about anything that happened
     * to be shut.
     *
     * ## What it replaced, and why the replacement is smaller
     *
     * There used to be four bodies here — «لازم «{lesson}» تخلص الأول», a quiz
     * variant, a generic fallback, and this one — plus a «نفتحها دلوقتي» button
     * that took the student to the lesson standing in the way. Every one of
     * them served the sequential chain, which is gone (see `gate-rule.ts`).
     *
     * That button is also the reason to state, here, that a dialog explaining
     * a block must not offer a control that lands the student where they
     * already are. Its destination was `blockerFor` — the nearest unfinished
     * lesson ABOVE the locked one — and on the player, where the student is
     * sitting on that lesson while tapping the padlock below it, that resolved
     * to the page they were already on. Pressing it navigated to the current
     * URL: no movement, no message, nothing. Reported exactly that way — «الـ٢
     * بتن دول مش شغالين» — and the second button, «تمام», was not broken at
     * all; it closed a dialog that left the student no better off, which reads
     * as the same failure.
     *
     * So this one has one control, it dismisses, and the sentence carries the
     * only actionable fact: how many lectures are left.
     */
    lockedExamTitle: 'الامتحان النهائي لسه مقفول',
    /**
     * `{remaining}` and `{total}` count LECTURES, matching «{n} درس خلص من {n}»
     * on the player's own progress line — quizzes are not in either number, and
     * are not in the gate's prerequisite set either.
     *
     * A count and not a list: a student four lectures from the end does not
     * need four titles, they need to know it is four.
     */
    lockedExamBody: 'بيفتح لما كل محاضرات الكورس تخلص — باقي {remaining} من {total}.',
    /** When the counts are not to hand — the dialog still has to say something. */
    lockedExamBodyPlain: 'بيفتح لما كل محاضرات الكورس تخلص.',
    /**
     * ⚠️ The FOOTER's dismiss only. The dialog's X must not carry this string —
     * see `exam-locked-dialog.tsx`. Two controls with one accessible name in
     * one dialog is ambiguous to anything navigating by name, and this dialog
     * shipped with exactly that: an X reading «تمام» and a button reading
     * «تمام». `exam-gate-dialog.tsx` states the rule; this one broke it.
     */
    lockedClose: 'تمام',
  },
  /** `/settings/section` — changing the year after onboarding. */
  section: {
    eyebrow: 'الإعدادات',
    title: 'صفّك الدراسي',
    subtitle: 'غيّره في أي وقت — الكورسات اللي تظهرلك بتتغيّر معاه.',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saveFailed: 'مقدرناش نحفظ التغيير. نحاول تاني.',
    /**
     * The reassurance a student needs before touching this. Changing section
     * writes four columns and nothing else — see `updateSection` in the API.
     */
    keepsProgress:
      'تقدمك محفوظ. ولو الرجوع للصف القديم حصل، هتلاقي كل اللي خلص ودرجاتك زي ما هي.',
    back: 'رجوع للكورسات',

    /**
     * When `/api/taxonomy` cannot be read, so the year select would have no
     * options. Same situation as `onboarding.unavailable*`, deliberately worded
     * differently: this student already HAS a section and is only changing it,
     * so the reassurance they need is that the setting they already have is
     * untouched — not that their account survived. Rendering the form with an
     * empty select would let them press «حفظ» on nothing, and the API would
     * answer with a validation error that blames them for it.
     *
     * The retry label is `copy.common.retry`.
     */
    unavailableTitle: 'مش قادرين نجيب قايمة الصفوف دلوقتي',
    unavailableBody:
      'مشكلة مؤقتة عندنا. صفّك الحالي وكل تقدمك زي ما هما ومحصلّهمش حاجة — نجرّب تاني بعد شوية.',
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
    title: 'تجربة الكود',
    subtitle: 'كود بيتكتب ويشتغل على طول. مافيش حاجة بتتحفظ ولا بتتصحّح — المكان ده للتجريب.',
    editorLabel: 'محرّر الكود',
    run: 'تشغيل',
    running: 'بيشتغل…',
    reset: 'رجوع المثال',
    copy: 'نسخ',
    copied: 'اتنسخ',
    output: 'النتيجة',
    outputEmpty: 'دوسة على «تشغيل» والنتيجة بتطلع هنا.',
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
    pythonLoad: 'تحميل البايثون (١٣ ميجا)',
    pythonLoading: 'بيحمّل البايثون… أول مرة بس',
    pythonReady: 'البايثون جاهزة',
    pythonNote:
      'البايثون بتشتغل جوّه المتصفّح عندك — مافيش كود بيتبعت لأي سيرفر. أول تحميل ١٣ ميجا وبعدها بيتخزّن.',
    pythonUnavailable: 'مقدرناش نشغّل البايثون على المتصفّح ده.',
    pythonNoPackages: 'المكتبات الخارجية زي numpy مش متاحة هنا — بايثون الأساسية بس.',
    resetRuntime: 'نبدأ من نضيف',
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
    hint: 'عام أو لغات أو الاتنين',
    general: 'عام',
    languages: 'لغات',
    /** The badge when a course or lesson serves both — not a third stream. */
    both: 'عام ولغات',
    required: 'لازم يتحدد عام أو لغات أو الاتنين',
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
    watch: 'مشاهدة',
    takeQuiz: 'دخول الاختبار',
    breadcrumbHome: 'الرئيسية',
    breadcrumbCatalog: 'الكورسات',
    content: 'محتوى الكورس',
    about: 'عن الكورس',
    instructor: 'المُحاضر',
    start: 'نبدأ الكورس',
    continue: 'نكمّل الكورس',
    enrolled: 'إنت في الكورس ده',
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
    lockedNote: 'الدروس بتفتح مع الدخول بالحساب',
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
    startNote: 'دوسة على «تشغيل» — لو الحساب داخل، الفيديو بيشتغل على طول، ولو لسه هنسجّلك الأول.',
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
    playCta: 'تشغيل الكورس',
    startPending: 'ثانية واحدة…',
    /** Every failure of the enroll click except 401, which navigates instead. */
    startError: 'مقدرناش نفتح الكورس دلوقتي. نحاول تاني.',
    /**
     * A course the instructor has closed. Deliberately NOT «حاول تاني» — the
     * student can retry all day and the door stays shut; what they need is to
     * know it is shut on purpose and who opens it.
     */
    lockedError: 'الكورس ده مقفول دلوقتي. رسالة للمهندس أيمن وهيفتحه.',
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
    markComplete: 'خلاص · التالي',
    markCompleteFinal: 'الدرس خلص',
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
    markFailed: 'ماتسجّلش إن الدرس خلص. تأكيد على النت ودوسة تانية.',
    completed: 'تم',
    inProgress: 'شغّال',
    notStarted: 'لسه',
    play: 'تشغيل الفيديو',
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
    /**
     * The generic fallback — and it used to be the ONLY thing said, for every
     * one of YouTube's error codes at once. The owner disabling embedding, a
     * deleted video and a blipped connection all collapsed into this sentence,
     * so neither the student nor the instructor could tell which had happened,
     * and «الفيديو شغال عندي» versus «بيقول مش متاح» had no way to be
     * reconciled. `onError` keeps the code now, and the three below split it.
     */
    videoUnavailable: 'الفيديو مش متاح دلوقتي',
    /** YouTube 101/150 — «السماح بالتضمين» is off on the video itself. The
     *  student cannot fix that, so it names the one thing they CAN do. */
    videoEmbedBlocked: 'الفيديو ده مش مسموح يتشغّل جوه المنصة. افتحه على يوتيوب.',
    /** YouTube 100 — removed, or private. */
    videoRemoved: 'الفيديو ده مش موجود على يوتيوب دلوقتي. ولو فضلت المشكلة، كلمة للمدرّس.',
    /** The IFrame API script never loaded: an ad blocker, filtered DNS, or no
     *  network. The only one of the four a retry can actually clear. */
    videoBlockedByBrowser: 'مش قادرين نحمّل مشغّل يوتيوب — يمكن مانع إعلانات أو النت.',
    videoRetry: 'نجرّب تاني',
    videoOpenOnYouTube: 'افتحه على يوتيوب',
    /** A video lesson whose `lesson_videos` row is missing entirely, which used
     *  to render as a blank 16/9 hole with no message and no logged error. */
    videoMissing: 'المحاضرة دي لسه مافيهاش فيديو.',
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
    openDocument: 'دوسة عشان يتفتح',
    closeDocument: 'دوسة عشان يتقفل',
    mainPresentation: 'البريزنتيشن الأساسي',
    openInNewTab: 'فتح في تبويب جديد',
    viewerUnavailable: 'المتصفح مش قادر يعرض الملف — التحميل بيفتحه.',
    noResources: 'مفيش مواد مرفوعة للدرس ده.',
    lockedHint: 'اللي قبله لازم يخلص الأول عشان يتفتح',
    examBadge: 'امتحان',
    examLockedHint: 'الامتحان بيتفتح لما كل المحاضرات تخلص',
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
    download: 'تحميل المحاضرة',
    quizIntro: 'الدرس ده اختبار — نبدأه في أي وقت.',
    quizCta: 'نبدأ الاختبار',
    courseProgress: 'تقدّمك في الكورس',
    lessonsCompleted: 'درس خلص من',
    autoCompleteHint: 'الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.',
    manualOnlyHint: 'مدة الفيديو مش متسجّلة، فدوسة على «الدرس خلص» في الآخر.',
    /* A quiz lesson has its own completion rule and it is not the two above:
       there is no video to watch and no button to press — passing the exam is
       what closes it. It used to be shown `manualOnlyHint`, which talks about
       a video's duration on a lesson that has no video. */
    quizAutoCompleteHint: 'الدرس ده بيتقفل لوحده مع النجاح في الاختبار.',
    quizYourScore: 'درجتك في الاختبار',
    quizNotSatYet: 'لسه مدخلتش الاختبار.',
    quizPassedNote: 'نجحت، والدرس اتقفل.',
    quizFailedNote: 'مراجعة الإجابات والدخول تاني ممكنين طول ما الاختبار مفتوح.',
    quizOpenCta: 'فتح الاختبار',
    saveFailed: 'مقدرناش نسجّل تقدّمك دلوقتي',
  },
  path: {
    eyebrow: '02 / مساري',
    title: 'مسارك التعليمي',
    subtitle: 'كل كورس مفتوح لك، بالترتيب اللي هتذاكر بيه.',
    summary: '{cleared} من {total} محاضرة في {courses} كورس',
    percentComplete: 'خلصت {percent}%',
    startHere: 'نبدأ من هنا',
    courses: 'الكورسات',
    /** `{n}` is the course's 1-based place in the student's run of courses. */
    courseIndex: 'الكورس {n}',
    empty: 'لسه مافيش أي كورس في القايمة.',
    emptyCta: 'الكورسات المتاحة',
    done: 'خلصت',
    locked: 'مقفول',
    exam: 'الامتحان النهائي',
    courseDone: 'الكورس خلص',
    nothingOpen: 'مفيش حاجة مفتوحة دلوقتي',

    // ── a course the instructor has taken down ───────────────────────────
    /**
     * The badge on a course whose `status` is no longer `published`.
     *
     * «مؤقتاً» is doing real work and is not padding. An instructor unpublishes
     * a course to EDIT it — for minutes, usually — and the student's enrolment,
     * progress and marks are all untouched throughout. A bare «مقفول» reads as
     * the same thing a locked lesson says, i.e. "you have not earned this yet",
     * which is the one meaning it must not carry: nothing the student did
     * closed this, and nothing they do will open it.
     */
    closedBadge: 'مقفول مؤقتاً',
    closedTitle: 'الكورس ده مقفول مؤقتاً',
    /**
     * Said in the dialog, when a stop on a closed course is pressed.
     *
     * Two facts, in the order a student needs them: their work is safe, and
     * there is nothing for them to do. No «حاول تاني» — a retry that cannot
     * succeed is worse than no button — and no apology, per the house rule that
     * errors state what happened rather than perform regret.
     */
    closedBody:
      'م. أيمن بيعدّل فيه دلوقتي، فمقفول للحظات. تقدمك ودرجاتك كلها محفوظة، وأول ما يخلص هيفتح لوحده — مش محتاج تعمل حاجة.',
    /** Footer dismiss only — the X takes `copy.common.close`. Same rule as
     *  `library.lockedClose`, written down here so the next dialog does not
     *  rediscover it. */
    closedClose: 'تمام',
  },
  dashboard: {
    eyebrow: '01 / حسابي',
    title: 'حسابي',
    continueWatching: 'نكمّل من مكانك',
    continueCta: 'نكمّل',
    remaining: 'باقي',
    myCourses: 'كورساتي',
    noCoursesYet: 'لسه مامعاكش أي كورس.',
    browseCourses: 'نختار كورس',
    /**
     * The band at the top of the home screen. Worded around what the student
     * MISSES by not joining — «تابعنا» is a request, «أول ما يتنزل درس» is a
     * reason — because the channel's whole value is reaching them on a day
     * they had no plan to open the platform.
     */
    whatsappChannel: {
      title: 'قناة الواتساب',
      lead: 'أول ما يتنزل درس جديد أو يتحدد ميعاد امتحان، هيوصلك على طول.',
      /**
       * «اشتراك» and not «اشترك» — the imperative is masculine, and YouTube's
       * own Arabic button has taught every student on this platform to read
       * the masdar as the same instruction. Same rule as the outreach pools.
       */
      cta: 'اشتراك',
    },

    /**
     * «رسالة من م. أيمن» — the unread outreach card at the top of the home
     * screen.
     *
     * ## Why the card exists when the message is already in the widget
     *
     * Because the widget is a 56px disc in a corner that a student has no
     * reason to press. The message is written to be read on the day it arrives
     * — «راجع دول النهارده وهما لسه طازة» — and one that waits behind a button
     * for a week is a message nobody sent. The card carries the first lines and
     * hands off to the thread, which is still the only place it can be
     * answered.
     *
     * It renders ONLY while unread. A permanent «رسالة من أيمن» panel that is
     * always there is furniture, and furniture is invisible.
     */
    instructorMessage: {
      eyebrow: 'رسالة جديدة',
      /** Under his name on the card. */
      role: 'م. أيمن أبو العلا',
      open: 'اقرأها وردّ',
      /** `{n}` — how many are waiting, when it is more than one. */
      more: 'وكمان {n} رسالة',
    },
    // ── the redesigned dashboard (added, nothing above was renamed) ──────
    /** `{name}` is the student's first name. */
    greeting: 'أهلًا {name}',
    greetingFallback: 'أهلًا وسهلاً',
    subtitle: 'ده مكان مذاكرتك كله — الكورسات، تقدّمك، ودرجاتك.',
    statCourses: 'كورساتك',
    statLessonsDone: 'دروس خلصتها',
    statOverall: 'إجمالي تقدّمك',
    statAverage: 'متوسط درجاتك',
    statNoScores: 'لسه',
    lessonsOf: 'من',
    lessonsWord: 'درس',
    progressLabel: 'التقدّم',
    openCourse: 'فتح الكورس',
    continueCourse: 'نكمّل الكورس',
    startCourse: 'نبدأ الكورس',
    courseDone: 'الكورس ده خلص',
    emptyTitle: 'نبدأ من كورس',
    emptyBody: 'أي كورس من صفّك ومساره، بالاشتراك فيه، بيبان هنا على طول مع تقدّمك فيه.',

    // ── the exams section ────────────────────────────────────────────────
    examsTitle: 'امتحاناتك',
    examsEmpty: 'لسه مافيش امتحانات. أول امتحان يخلص هيبان هنا بدرجته.',
    /**
     * It said «كورساتك» and it went to `/path` — «مسارك التعليمي». A button
     * whose word and destination disagree is one of the two ways a press stops
     * meaning anything (the other is a press with no destination at all), and
     * this one is on the empty state a brand-new student meets first.
     *
     * The word is what changed, not the destination: `/path` IS the right place
     * from here — it is where a student sees what is open to them next, and it
     * is where the exam they have not sat yet will appear.
     */
    examsEmptyCta: 'مسارك التعليمي',
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
      reviewCta: 'مراجعة',
      strongLabel: 'متمكّن في:',
      /** Nothing sat yet, or every topic still under the evidence floor. */
      emptyBody:
        'لسه بنجمّع صورة عن مستواك. كام امتحان كمان وهتلاقي هنا بالظبط الضعف فين.',
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
    startHereTitle: 'نبدأ من هنا',
    /** `{done}` / `{total}` are step counts, e.g. "خطوة ١ من ٣". */
    startHereProgress: 'خطوة {done} من {total}',
    startHereNote: 'عشر دقايق في اليوم أحسن من ساعة مش هتذاكرها أصلًا.',
    stepEnrollTitle: 'نختار كورس ونشترك فيه',
    stepEnrollBody: 'أي كورس من سنتك ومسارك بيظهر في قائمتك على طول.',
    stepEnrollCta: 'نشوف الكورسات',
    stepLessonTitle: 'فتح أول درس',
    stepLessonBody: 'الدرس بيتقفل لوحده لما توصل لآخر الفيديو وتكون شُفت معظمه.',
    stepLessonCta: 'فتح الدرس',
    stepQuizTitle: 'حل أول اختبار',
    stepQuizBody: 'كل درس وراه اختبار قصير. درجتك بتظهر هنا على طول بعد التسليم.',
    stepQuizCta: 'مسارك',
    /**
     * What a step that is not its turn yet says when it is pressed.
     *
     * The two rows under the current one used to be inert — no link, no body
     * text, no response of any kind to a press. They now open a dialog, and
     * these are the two sentences in it: the reason, and then the step above
     * offering to take them there. «أقول له بعد إذنك اتفرج على الكورس الأول».
     *
     * Written as a REASON, not as a refusal. «مش هينفع» tells a student they
     * did something wrong; «الاختبار بييجي بعد الدرس» tells them how the
     * course works, which is the thing they are actually missing.
     */
    stepBlockedTitle: 'لسه بدري شوية على الخطوة دي',
    stepLessonBlocked: 'عشان تفتح درس، لازم تكون مشترك في كورس الأول. نختار كورس ونبدأ.',
    stepQuizBlocked: 'الاختبار بييجي بعد الدرس — افتح أول درس، والاختبار بتاعه هيفتح بعده.',
    /**
     * Step 3 pressed by a student who has no course at all.
     *
     * `stepQuizBlocked` above would be wrong here — it says «افتح أول درس»,
     * and there is no lesson to open. Each step explains itself in ITS own
     * terms and then points at the earliest thing that is actually missing;
     * this is the two-hop version of that sentence.
     */
    stepQuizBlockedNoCourse:
      'الاختبار بييجي بعد الدرس، والدرس بييجي بعد ما تشترك في كورس. نبدأ من هنا.',
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
      note: 'بتتفتح لوحدها مع المذاكرة.',
      /** `{earned}` of `{total}`, in the section heading's count slot. */
      count: '{earned} من {total}',
      /** Appended to an earned marker's accessible name. */
      earned: 'اتحقّق',
      /** Appended to one that has not been earned, before its hint. */
      locked: 'لسه',
      firstLessonTitle: 'أول درس',
      firstLessonHint: 'أول محاضرة لحد آخرها.',
      tenLessonsTitle: 'عشر دروس',
      tenLessonsHint: 'عشر محاضرات في أي كورس.',
      firstExamTitle: 'أول امتحان',
      firstExamHint: 'أول امتحان يتقدّم ويتسلّم.',
      firstPassTitle: 'أول نجاح',
      firstPassHint: 'اعدّي أي امتحان.',
      courseDoneTitle: 'كورس كامل',
      courseDoneHint: 'كورس كامل من أوله لآخره.',
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
    emptyBody: 'كل درس وراه امتحان قصير. أول ما واحد يخلص، درجتك ومراجعة إجاباتك هيبانوا هنا.',
    emptyCta: 'مسارك',
  },

  /** Slice 3 — `/profile`. */
  profile: {
    eyebrow: '04 / بروفايلي',
    title: 'بروفايلي',
    subtitle: 'بياناتك، اللي حصّلته، والأجهزة اللي حسابك مفتوح عليها.',
    // ── the photo ──────────────────────────────────────────────────────
    photoTitle: 'صورتك',
    photoHint: 'PNG أو JPG، لحد ٢ ميجا. هنقصّها مربّعة تلقائيًا.',
    photoChange: 'تغيير صورتك',
    photoUploading: 'بنرفع الصورة…',
    photoDone: 'اتغيّرت صورتك',
    photoFailed: 'مقدرناش نرفع الصورة. نجرّب صورة تانية.',
    photoTooLarge: 'الصورة أكبر من ٢ ميجا. صغّرها وجرّب تاني.',
    photoWrongType: 'ده مش ملف صورة. المطلوب PNG أو JPG.',
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
    activityEmpty: 'أول ما درس يتفتح أو امتحان يتقدّم، الحركة بتبان هنا.',
    activityMore: 'أقدم',
    activityLoading: 'بنجيب…',
    activityFailed: 'مقدرناش نجيب باقي السجل. نحاول تاني.',
    /** `{duration}` is already formatted, e.g. "١٢ دقيقة". */
    activityWatched: 'شُفت الدرس لمدة {duration}',
    activityCompleted: 'الدرس خلص',
    /** How a lesson was completed, appended to `activityCompleted`. */
    activityViaAuto: 'تلقائيًا',
    activityViaManual: 'بنفسك',
    activityViaDwell: 'بعد قراية الدرس',
    /** `{score}` is a percentage. */
    activityQuiz: 'امتحان بدرجة {score}%',
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
    chartsEmpty: 'أول اختبار يخلص هتلاقي درجتك هنا مرسومة.',
  },

  /** Slice 4 — in-app notifications. */
  notifications: {
    eyebrow: '05 / الإشعارات',
    title: 'الإشعارات',
    subtitle: 'كل حاجة حصلت في حسابك وتستاهل المعرفة.',
    /** `aria-label` on the bell. `{n}` is the unread count. */
    bell: 'الإشعارات',
    bellWithUnread: 'الإشعارات — {n} جديدة',
    panelTitle: 'الإشعارات',
    markAllRead: 'علّم الكل كمقروء',
    markingAll: 'بنعلّم…',
    seeAll: 'الكل',
    empty: 'مفيش إشعارات لسه.',
    emptyHint: 'أول ما تتصحّح لك ورقة أو يتردّ على تظلّم، هتلاقيه هنا.',
    more: 'أقدم',
    loading: 'بنجيب…',
    failed: 'مقدرناش نجيب الإشعارات. نحاول تاني.',
    // ── the three kinds ────────────────────────────────────────────────
    /** `{score}` is a percentage. */
    quizGraded: 'اتصحّحت ورقتك — الدرجة {score}%',
    quizGradedPassed: 'نجحت',
    /** Same word, same reason, as `quiz.failed` — a notification that told a
     *  student to sit the quiz again was pointing at a door that is not there. */
    quizGradedFailed: 'محتاجة مراجعة',
    extraAttempt: 'المدرّس دّالك محاولة زيادة في الامتحان ده',
    /** المساعد — the instructor answered a conversation this student opened.
     *  Carries no lesson, which is why `EmitInput` stopped requiring one. */
    conversationReply: 'مهندس أيمن ردّ على سؤالك',
    /**
     * «رسايل م. أيمن» — he wrote FIRST.
     *
     * A LEAD-IN, not the message. The message itself is in the conversation,
     * where the student can answer it; a notification that repeated the body
     * would be a second copy of a sent message, free to disagree with the
     * first, and would let a student read it without ever landing on the reply
     * box — which is the whole point of sending it as a chat message.
     *
     * The per-kind variants exist because "أيمن بعتلك رسالة" tells a student
     * nothing about whether it is worth opening now. `instructorMessage` is
     * the fallback for a row written by a build that knew a kind this one does
     * not.
     */
    instructorMessage: 'مهندس أيمن بعتلك رسالة',
    instructorMessageQuizResult: 'مهندس أيمن شاف نتيجتك',
    instructorMessageQuizNudge: 'مهندس أيمن فاكرك بالكويز',
    instructorMessageLessonPraise: 'مهندس أيمن بعتلك كلمتين',
    instructorMessageWhatsappInvite: 'مهندس أيمن عازمك على جروب الواتساب',
    /** Relative time, e.g. "من ٣ ساعات" — `{value}` is already formatted. */
    ago: 'من {value}',
  },
  enrollment: {
    enroll: 'الاشتراك في الكورس',
    enrolled: 'إنت في الكورس',
    enrolling: 'بنشتركك…',
    startCourse: 'نبدأ الكورس',
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
    open: 'فتح المساعد',
    openWithReply: 'فتح المساعد — فيه رد جديد',
    close: 'قفل المساعد',
    title: 'مساعد المنصة',
    subtitle: 'إجابات سريعة، ولو مالقيتش اللي بتدوّر عليه بوصّلك لأيمن.',
    /**
     * The two WhatsApp links in the panel's footer, on every screen of the
     * guide. «القناة» first: it is the one that reaches the student again
     * tomorrow without anybody typing a reply.
     */
    whatsapp: {
      channel: 'قناة الواتساب',
      chat: 'التواصل على واتساب',
    },

    /* ── the open chat ──────────────────────────────────────────────────
     *
     * ⚠️ Every string here is read by somebody whose gender the platform has
     * never asked for — see the rule at the top of `copy/outreach.ts`. Nothing
     * below is an imperative: «كتابة» not «اكتب», «إرسال» not «ابعت», and the
     * first person («أقدر», «أوصّلك») wherever a sentence is about what
     * المساعد does rather than about what the reader should.
     */
    ai: {
      /** The empty state, above the starter chips. */
      lead: 'اسأل أي حاجة عن المنصة أو عن المادة، بالعامية عادي.',
      /** Four openers, so nobody faces an empty box with a blinking line in it. */
      starters: [
        'الكورسات المفتوحة دلوقتي إيه؟',
        'إزاي أشترك في كورس؟',
        'الامتحانات شكلها إيه؟',
        'يعني إيه متغيّر في البرمجة؟',
      ],
      placeholder: 'سؤالك هنا…',
      send: 'إرسال',
      /** On the button while an answer is still arriving. */
      stop: 'إيقاف',
      /** Under the robot while it is still thinking and no text has arrived yet. */
      thinking: 'بيفكّر…',
      you: 'إنت',
      bot: 'مساعد المنصة',
      /** Wipes the transcript. It was never stored anywhere, so this is the whole delete. */
      clear: 'محادثة جديدة',
      /**
       * Under the composer, once and quietly.
       *
       * It is one sentence and it says the two things that matter: the replies
       * are automatic, and a person is one tap away. A student who believes
       * they are typing to أيمن and gets a machine's answer has been misled by
       * the product, not by the machine.
       */
      disclaimer: 'ردود آلية من كلام المنصة نفسها. ولو مش كفاية، م. أيمن تحت.',
      /** No written answer was close enough to be worth saying. */
      unknown: 'السؤال ده مش لاقي ليه إجابة مظبوطة عندي، ومش عايز أخمّن.',
      /** A safety decline. Deliberately not routed to the inbox — see the service. */
      refused: 'ده مش حاجة أقدر أساعد فيها. أنا هنا للمنصة وللمادة نفسها.',
      /**
       * The exam lock, and the ONE thing المساعد says while a paper is open.
       *
       * The model is not called at all on this path — see the controller — so
       * this string is the entire answer to every question asked during a
       * sitting, whatever it was. It says the rule and the reason in one line,
       * and it does NOT accuse: the overwhelming majority of the people who
       * see it opened the panel out of habit, not to cheat.
       *
       * «مقفول» about the assistant, not about the student. Nothing here is
       * second person, so nothing here has a gender.
       */
      duringExam:
        'المساعد مقفول أثناء الامتحان — ده جزء من إن الدرجة تبقى بجد. أول ما الامتحان يتسلّم، أنا هنا.',
      failed: 'حصلت مشكلة في الرد. تحاول تاني بعد شوية.',
      tooMany: 'أسئلة كتير في وقت قصير. شوية ونكمّل.',
      /* ── the card that goes up when المساعد says «ده لأيمن» ────────── */
      escalateTitle: 'السؤال ده محتاج أيمن',
      escalateBody: 'أوصّله ليه بالسؤال زي ما هو، والرد بيرجع هنا ومعاه إشعار.',
      escalateAction: 'إرسال السؤال لأيمن',
    },

    /* ── كل اللي المساعد يعرفه ───────────────────────────────────────────
     *
     * The corpus, and the reason «إزاي أدخل المنصة؟» has an answer at all.
     *
     * ## Why this is not more nodes on the question tree
     *
     * The tree is a MENU, and a menu pays for every entry twice: once in the
     * button a student has to read past, and once in the depth it adds to
     * reaching anything else. Twenty-four buttons is not a better menu than
     * five, it is a worse one. But twenty-four FACTS is strictly better than
     * five for something that answers a typed question, because nobody reads
     * the list — they ask, and the right one is found for them.
     *
     * So the tree keeps the handful of questions worth pressing, and this
     * holds everything else المساعد is allowed to say. `assistant-knowledge.ts`
     * on the API side merges the two into one corpus.
     *
     * ## It is read by BOTH halves, which is why it is here and not in a prompt
     *
     * With a model configured, this is the grounding — the model rephrases
     * these facts into the student's own words and may not invent past them.
     * With no model (every fresh deployment, and CI), `matchKnowledge` returns
     * one of these verbatim. So every `a` below has to read as a finished
     * answer to a person, not as a note to a machine.
     *
     * ## ⚠️ Two rules, and the second one is the load-bearing one
     *
     * 1. NOTHING HERE MAY BE GENDERED. Every string is read by a student whose
     *    gender the platform never asked for — verbal nouns («دوسة على…»),
     *    nominal sentences, or the first person. Never «اضغط», never «هتلاقي».
     *    See the note at the top of `copy/outreach.ts`.
     *
     * 2. NOTHING HERE MAY BE A GUESS. Every answer below was checked against
     *    the code that implements it, and the one that was not — the old
     *    «نسيت كلمة السر» line, which described a reset flow this product does
     *    not have — is exactly why the rule is written down. A wrong answer
     *    here is worse than no answer: it is confident, it is in the
     *    platform's own voice, and it talks a stuck student out of asking the
     *    one person who could have helped.
     *
     * Prices, dates and offers are deliberately absent and must stay absent.
     * They change without anybody touching this repo, and both halves are
     * instructed to route them at أيمن instead.
     */
    knowledge: [
      // ── الحساب والدخول ──────────────────────────────────────────────
      {
        id: 'enter',
        q: 'إزاي أدخل المنصة وأعمل حساب؟',
        a: 'من زرار «حساب جديد»: الاسم، ورقم الموبايل، وكلمة سر — والإيميل اختياري. وبعدها شوية بيانات سريعة (المحافظة، المدرسة، السنة الدراسية، ورقم ولي الأمر) عشان المنصة تعرف تورّي كورسات سنتك بالظبط. الخطوة كلها بتاخد دقيقة.',
      },
      {
        id: 'loginHow',
        q: 'عندي حساب — أدخل إزاي؟',
        a: 'من صفحة الدخول: رقم الموبايل (أو الإيميل لو كان مضاف) وكلمة السر. والحساب بيفضل مفتوح حوالي تلات شهور، وبيتجدّد لوحده كل ما المنصة تتفتح.',
      },
      {
        id: 'loginIdentity',
        q: 'الدخول بالإيميل ولا بالرقم؟',
        a: 'رقم الموبايل هو أساس الحساب. الإيميل اختياري وقت التسجيل، ولو اتضاف بيشتغل في الدخول برضه.',
      },
      {
        id: 'emailNone',
        q: 'مش عندي إيميل — أقدر أسجّل؟',
        a: 'أيوة، عادي خالص. الإيميل اختياري بالكامل، والمنصة أصلاً مابتبعتش إيميلات — الرقم هو اللي بيتم الدخول بيه.',
      },
      {
        id: 'passwordLost',
        q: 'نسيت كلمة السر',
        a: 'مفيش لينك استرجاع، لأن المنصة مابتبعتش إيميلات ولا رسايل. أيمن هو اللي بيرجّع كلمة السر — من زرار «أكلّم م. أيمن» تحت، أو على الواتساب. الاتنين بيوصلوا ليه.',
      },
      {
        id: 'profileEdit',
        q: 'أعدّل بياناتي',
        a: 'من صفحة «بروفايلي» بيتعدّل الاسم والرقم والمحافظة والمدرسة والسنة الدراسية. وللعلم: تغيير السنة بيغيّر الكورسات اللي المنصة بتعرضها.',
      },
      {
        id: 'devices',
        q: 'حسابي مفتوح على جهاز مش بتاعي',
        a: 'صفحة «أجهزتي» بتوري كل الأجهزة اللي الحساب مفتوح عليها دلوقتي، وكل واحد فيهم جنبه زرار «قفل الجهاز». القفل بيشتغل فورًا.',
      },
      {
        id: 'banned',
        q: 'حسابي موقوف',
        a: 'الإيقاف بيقفل الدخول، وصفحة الدخول بتوري السبب. ولو فيه غلط، رسالة لأيمن وهيتظبط.',
      },
      {
        id: 'parentPhone',
        q: 'ليه بتطلبوا رقم ولي الأمر؟',
        a: 'عشان نقدر نتواصل مع ولي الأمر عن المستوى لو احتاج. مابيتستعملش في أي حاجة تانية.',
      },
      {
        id: 'privacy',
        q: 'بياناتي بتروح فين؟',
        a: 'بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش ولا بتتشارك مع حد. صفحة «سياسة الخصوصية» فيها بالظبط بنجمع إيه وليه.',
      },

      // ── الكورسات والمذاكرة ──────────────────────────────────────────
      {
        id: 'coursesWhere',
        q: 'الكورسات فين؟',
        a: 'صفحة «الكورسات» فيها كل الكورسات المنشورة مرتّبة بالصف والمسار، وكورساتك إنت بتيجي في الأول. وصفحة «مساري» بتوري الكورسات المفتوحة لك بالترتيب اللي هتتذاكر بيه.',
      },
      {
        id: 'startWhere',
        q: 'أبدأ منين؟',
        a: 'من صفحة «حسابي» — فيها كارت «نكمّل من مكانك» بيودّي على آخر درس وقفت عنده. ولو دي البداية خالص، مسار «التأسيس» هو نقطة البداية للي لسه مايعرفش حاجة عن البرمجة.',
      },
      {
        id: 'essentials',
        q: 'التأسيس ده إيه؟',
        a: 'مسار قصير قبل أول سطر كود: المصطلحات والأفكار اللي بتتكرر في أي لغة برمجة، كل واحد منهم في سطرين. اللي مش عارف حاجة عن البرمجة بيبدأ من هنا.',
      },
      {
        id: 'yearMatch',
        q: 'الكورس ده لسنتي ولا لأ؟',
        a: 'كل كورس متعلّم بصفّه ومساره، والقايمة بتترتّب على أساس السنة اللي في حسابك. ولو السنة في البروفايل مش مظبوطة، تعديلها بيغيّر اللي بيتعرض.',
      },
      {
        id: 'stream',
        q: 'عام ولا لغات؟',
        a: 'المنصة بتفرّق بين مدارس عام ومدارس لغات، والاختيار ده بيتحدد في بياناتك وبيتعدّل من البروفايل. وكل درس مكتوب عليه هو للمسارين ولا لواحد بس.',
      },
      {
        id: 'lessonLocked',
        q: 'الدرس مش بيفتح',
        a: 'الدروس كلها مفتوحة جوه الكورس — مفيش درس بيستنى اللي قبله. اللي بيقفل المحتوى حاجتين بس: إن الحساب يكون داخل، وإن الكورس يكون مفتوح لك. ولو الاتنين تمام والدرس لسه واقف، ده يستاهل رسالة لأيمن ومعاها اسم الدرس.',
      },
      {
        id: 'downloads',
        q: 'الملخصات والملفات فين؟',
        a: 'مع الدرس نفسه — كل درس معاه ملخّص مكتوب وملفات للتحميل. والمراجعات والملفات الكبيرة بتتنزل كمان على قناة الواتساب.',
      },
      {
        id: 'playground',
        q: 'تجربة الكود دي إيه؟',
        a: 'صفحة «تجربة الكود»: كود بيتكتب ويشتغل على طول في المتصفح. مافيش حاجة بتتحفظ ولا بتتصحّح — المكان ده للتجريب بس.',
      },

      // ── الامتحانات والنتايج ─────────────────────────────────────────
      {
        id: 'resultsWhere',
        q: 'نتايجي فين؟',
        a: 'صفحة «نتائجي» فيها كل امتحان اتدخل، الدرجة فيه، وشكل التحسّن مع الوقت. وصفحة «بروفايلي» فيها نفس الرسوم مع باقي البيانات.',
      },
      {
        id: 'gradeLate',
        q: 'امتحنت والدرجة لسه ماظهرتش',
        a: 'الأسئلة الاختيارية بتتصحّح لحظيًا. الأسئلة المقالية بيصحّحها أيمن بنفسه، فدي بتاخد وقت — وأول ما تتصحّح بيوصل إشعار.',
      },
      {
        id: 'examProblem',
        q: 'حصلت مشكلة في نص الامتحان',
        a: 'ده اللي محتاج أيمن نفسه: النت قطع، الصفحة قفلت، أو الوقت خلص بسبب مشكلة تقنية. رسالة ليه ومعاها اسم الدرس وإيه اللي حصل بالظبط.',
      },
      {
        id: 'notifications',
        q: 'الإشعارات بتوصل إمتى؟',
        a: 'صفحة «الإشعارات» فيها كل حاجة حصلت في الحساب: امتحان اتصحّح، رد من أيمن، أو جديد اتنزل.',
      },

      // ── تواصل ومشاكل ────────────────────────────────────────────────
      {
        id: 'whatsappChannel',
        q: 'قناة الواتساب فيها إيه؟',
        a: 'الملفات والمراجعات. وأول ما يتنزل درس جديد أو يتحدد ميعاد امتحان بيوصل عليها على طول. اللينك موجود تحت في المساعد.',
      },
      {
        id: 'install',
        q: 'فيه تطبيق للموبايل؟',
        a: 'مفيش تطبيق على المتاجر — المنصة بتشتغل من المتصفح عادي. وممكن تتضاف للشاشة الرئيسية من قايمة المتصفح، وساعتها بتفتح زي أي تطبيق.',
      },
      {
        id: 'slow',
        q: 'الصفحة بطيئة أو مش بتفتح',
        a: 'قفل الصفحة وفتحها تاني الأول — ده بيحل أغلب الحالات. ولو لسه، متصفح تاني أو شبكة تانية. ولو المشكلة مستمرة، رسالة لأيمن ومعاها اسم الصفحة.',
      },
      {
        id: 'whoIsAyman',
        q: 'مين أيمن أبو العلا؟',
        a: 'المهندس أيمن أبو العلا — مدرّس البرمجة وعلوم الحاسب للمرحلة الثانوية، ومهندس برمجيات شغّال في السوق من سنين. صفحة «عن المنصة» فيها التفاصيل.',
      },
    ] as const,

    /**
     * The footer strip, on EVERY screen of the panel.
     *
     * «عايز يقدر يتواصل مع المهندس أيمن على طول» — and before this, «على طول»
     * was not true: reaching him meant opening the panel, walking two or three
     * stops into the tree, and finding a tinted row at the bottom of a menu.
     * A student who already knew they wanted a person had to answer four
     * questions they did not care about first.
     */
    contact: {
      lead: 'محتاج حد يرد بنفسه؟',
      ayman: 'أكلّم م. أيمن',
    },

    /** The transcript's label for what the visitor pressed. */
    youPicked: 'الاختيار',

    // ── node bodies. Keys ARE the node ids. ────────────────────────────
    script: {
      root: 'أهلاً وسهلاً! أنا هنا أجاوب على أكتر الأسئلة اللي بتتسأل. دي أكترهم:',

      courses: 'تمام. السؤال عن الكورسات في إيه بالظبط؟',
      coursesList: 'دي الكورسات المفتوحة دلوقتي:',
      courseInside:
        'كل كورس متقسّم وحدات، وكل وحدة فيها دروس فيديو ومعاها ملخّص مكتوب وملفات للتحميل. بعد كل درس فيه كويز قصير يقيس فهمك، وآخر كل وحدة امتحان شامل.',
      courseStart:
        'الكورس مالوش ميعاد بداية ثابت — أول ما الاشتراك يتم بيتفتح على طول، والمشي فيه بالسرعة اللي تريّح. اللي بيكون بميعاد هو المراجعات النهائية قبل الامتحانات، ودي بتتعلن على الصفحة الرئيسية وعلى واتساب.',

      join: 'الأسئلة اللي بتتسأل هنا:',
      joinAccount:
        'دوسة على إنشاء حساب، وبعدها الاسم والرقم والمحافظة والسنة الدراسية. الخطوة دي بتاخد دقيقة، وبعدها المنصة بتعرف تورّي مواد سنتك بالظبط بدل الدوران.',
      joinEnroll:
        'من صفحة الكورس، دوسة على «الاشتراك في الكورس». لو الكورس متاح لسنتك هيتفتح على طول وهتلاقيه في لوحتك.',
      joinPrice:
        'الأسعار والعروض بتتغيّر من فترة للتانية، فمش عايز أقولك رقم قديم. أحسن حاجة إني أوصّلك لأيمن يقولك السعر الحالي بالظبط.',

      study: 'السؤال في إيه؟',
      studyQuizzes:
        'الكويزات القصيرة اختيار من متعدد وصح وغلط، وبتتصحّح لحظياً وتشوف نتيجتك على طول. الامتحانات الشاملة ممكن يكون فيها أسئلة مقالية بيصحّحها أيمن بنفسه، ودي بتاخد وقت — وهيوصلك إشعار أول ما تتصحّح.',
      studyRetake:
        'كل كويز ليه محاولة واحدة بس، ودرجتها بتتسجّل وبتفضل. الاستثناء الوحيد هو الامتحان النهائي بتاع الكورس: بعده فيه امتحان تحسين مرة واحدة بأسئلة مختلفة، وأعلى درجة في الاتنين هي اللي بتتحسب — يعني التحسين مش بيضيّع درجة. ولو حصلت مشكلة تقنية في نص الامتحان، رسالة لأيمن.',
      studyProgress:
        'كل درس بيخلص بيتسجّل لوحده من غير أي حاجة، ولوحتك بتوريك نسبة كل كورس وآخر درس اتفتح عشان الكمالة تبقى من نفس المكان.',

      account: 'المشكلة في إيه؟',
      /**
       * ⚠️ THIS ANSWER USED TO DESCRIBE A FLOW THAT DOES NOT EXIST.
       *
       * It said: «دوسة على "نسيت كلمة السر" وكتابة الإيميل، وهيوصلك لينك
       * تتغيّر منه» — a button that is on no page in this app, and an email
       * from a product that sends none. `auth.config.ts` states it outright
       * next to the disabled OTP plugin: "a student who forgets their password
       * currently has none". `auth.fields.emailOptionalHint` says the same
       * thing to the student on the form itself — «المنصة مابتبعتش إيميلات».
       *
       * The cost of a wrong answer here is the worst on this surface: a
       * student locked out of their account is told to go and wait for a
       * message, so they wait instead of asking, and the one thing that could
       * actually help them is the thing the answer talked them out of.
       *
       * So it says what is true, and the node escalates. When the WhatsApp
       * Business number lands and `/phone-number/reset-password` is turned on
       * (see `auth.config.ts`), this is the first copy to rewrite.
       */
      accountPassword:
        'الدخول هنا بيتم برقم الموبايل، والمنصة مابتبعتش إيميلات — فمفيش لينك «نسيت كلمة السر» يتبعت. لو كلمة السر ضاعت، أيمن هو اللي بيرجّعها: رسالة ليه من هنا، أو على الواتساب.',
      accountProfile:
        'من صفحة حسابي بيتعدّل الاسم والرقم والمحافظة والسنة الدراسية. وللعلم: تغيير السنة بيغيّر المواد اللي المنصة بتعرضها.',
      accountVideo:
        'قفل الصفحة وفتحها تاني الأول — ده بيحل أغلب الحالات. ولو الفيديو لسه واقف، متصفح تاني أو شبكة تانية. ولو المشكلة مستمرة، أنا أوصّلك لأيمن ومعاه اسم الدرس.',
    },

    // ── choice labels. Keys ARE the choice ids. ────────────────────────
    choices: {
      back: 'رجوع',
      talk: 'أكلّم أيمن',

      courses: 'الكورسات والمحتوى',
      join: 'الاشتراك والحساب',
      study: 'المذاكرة والامتحانات',
      account: 'مشكلة في حسابي',

      coursesAvailable: 'إيه المتاح دلوقتي؟',
      courseInside: 'الكورس فيه إيه؟',
      courseStart: 'هنبدأ إمتى؟',
      browseCourses: 'الكورسات المتاحة',
      essentials: 'أساسيات المادة',

      joinAccount: 'إزاي أعمل حساب؟',
      joinEnroll: 'إزاي أشترك في كورس؟',
      joinPrice: 'الكورس بكام؟',
      register: 'إنشاء حساب',

      studyQuizzes: 'الامتحانات شكلها إيه؟',
      studyRetake: 'أقدر أعيد الامتحان؟',
      studyProgress: 'تقدّمي بيتحسب إزاي؟',
      dashboard: 'لوحتي',

      accountPassword: 'نسيت كلمة السر',
      accountProfile: 'أعدّل بياناتي',
      accountVideo: 'الفيديو مش شغّال',
      login: 'صفحة الدخول',
      profile: 'صفحة حسابي',
    },

    // ── the handoff form ───────────────────────────────────────────────
    escalate: {
      title: 'إرسال لأيمن',
      lead: 'سؤالك هنا، والرد هيوصلك في نفس المكان ومعاه إشعار.',
      leadGuest: 'سؤالك هنا، ومعاه اسمك ورقم الواتساب. الرد هيوصلك هنا، وعلى رقمك.',
      /** Above the breadcrumbs of the path the visitor walked. */
      pathLabel: 'وصل لهنا من:',
      name: 'اسمك',
      namePlaceholder: 'الاسم بالكامل',
      phone: 'رقم الواتساب',
      phonePlaceholder: '01xxxxxxxxx',
      message: 'سؤالك',
      messagePlaceholder: 'سؤالك هنا…',
      send: 'إرسال',
      sending: 'بنبعت…',
      sentTitle: 'وصلت لأيمن',
      sentBody: 'هيرد من هنا. والصفحة ممكن تتقفل عادي — الرد مش هيضيع.',
      failed: 'مقدرناش نبعت رسالتك. نحاول تاني.',
      tooMany: 'رسايل كتير في وقت قصير. شوية ونحاول تاني.',
    },

    // ── the visitor's side of an open conversation ─────────────────────
    thread: {
      title: 'محادثتك مع مهندس أيمن',
      you: 'إنت',
      ayman: 'مهندس أيمن',
      /**
       * `alt` on his photograph, beside his messages.
       *
       * The face is the load-bearing part of «رسايل م. أيمن»: a message that
       * says «شفت نتيجتك» over a generic avatar reads as a system notice
       * wearing a name. A screen-reader user gets the same claim in words.
       */
      aymanAvatarAlt: 'م. أيمن أبو العلا',
      /**
       * The card a WhatsApp link becomes inside a message.
       *
       * The card replaces the address entirely — 55 unbreakable characters do
       * not fit in a chat bubble and ran off the side of the panel — so these
       * three strings are the ONLY thing naming the destination. «القناة» and
       * not «الجروب»: that is where he uploads the material, and it is the
       * link `OutreachService.context` actually sends.
       *
       * Three parts rather than one «قناة الواتساب — كل الملفات والمراجعات»,
       * because the card now has three places to put them: the name, the line
       * that says what is in it, and the button. One string set in one weight
       * was a label pretending to be a card.
       *
       * `action` is «فتح القناة» and not «افتح القناة» — a masdar, which is
       * the same word whoever is reading it. The imperative is not; see the
       * gender rule at the top of `copy/outreach.ts`.
       */
      whatsappCard: {
        title: 'قناة الواتساب',
        lead: 'كل الملفات والمراجعات',
        action: 'فتح القناة',
      },
      /** Under his name on the first message of a thread he started. */
      aymanRole: 'مدرّس المادة',
      waiting: 'مستنيين رد أيمن.',
      /* ── الملف المرفق ────────────────────────────────────────────────
       *
       * The STUDENT's side of an attachment, so the gender rule applies in
       * full: «تحميل» is a masdar — the same word whoever is reading it —
       * where «حمّل» would be an imperative that grows a ي in the feminine.
       * Nothing here is said ABOUT the reader, so no participle is needed.
       */
      attachmentDownload: 'تحميل',
      attachmentImageAlt: 'ملف مرفق',
      replyPlaceholder: 'ردّك هنا…',
      send: 'إرسال',
      closed: 'المحادثة دي اتقفلت. ولو فيه حاجة تانية، نبدأ من الأول.',
      failed: 'مقدرناش نجيب المحادثة. تحديث الصفحة ونحاول تاني.',
    },

    // ── /admin/inbox ───────────────────────────────────────────────────
    inbox: {
      eyebrow: 'الوارد',
      title: 'صندوق الوارد',
      subtitle: 'أسئلة الطلبة والزوار — بس اللي حد كتبها بإيده.',
      empty: 'مفيش رسايل جديدة.',
      /* Nominal: «جالك» carries a ـك on a VERB and «اضغط/تشوف» are 2nd person,
         all three of which inflect. What the sentence has to say is a fact
         about the inbox, not an instruction to a person. */
      emptyHint: 'كل الرسايل مقروءة. تاب «الكل» فيه المحادثات القديمة.',

      /* ── الرسايل الأوتوماتيك ─────────────────────────────────────────
       *
       * A pointer, not a tab. «اللي بعتّه» used to be a second half of this
       * screen; it is now `/admin/outreach` («رسايلي للطلبة»), which shows
       * every automated message with the facts it was composed from — more
       * than the tab ever did. The line stays here because a screen that
       * silently stopped showing something owes the reader a sentence saying
       * where it went.
       */
      systemNote: 'الرسايل اللي المنصة بتبعتها أوتوماتيك مش هنا —',
      systemLink: 'رسايلي للطلبة',
      /** Prefixes the preview when the last word in the thread was his own. */
      previewYou: 'إنت:',
      /** On a row the platform opened and the student then answered. */
      outreachBadge: 'رسالة منك',
      /** On an outreach row the student answered — the ones that worked. */
      repliedBadge: 'وصل رد',

      /* ── filters ─────────────────────────────────────────────────────
       *
       * «غير مقروءة» is the default, and it is not a synonym for «محتاجة رد»
       * — that is the whole point of having both. Opening a thread marks it
       * read; only writing an answer marks it answered. A question he read and
       * decided needed no reply leaves the first tab and stays on the second.
       */
      filterUnread: 'غير مقروءة',
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
      /* ── «ردّ بإيموجي» ────────────────────────────────────────────────
       *
       * The gesture is a long press on the bubble, which is invisible and
       * impossible without a touch screen — so there is also a button, and
       * these are its accessible names. They are never SEEN by anyone; a
       * reaction row that spelled out «اختار إيموجي» beside six emoji would
       * be labelling the obvious.
       */
      reactLabel: 'ردّ بإيموجي',
      reactClose: 'قفل الإيموجي',

      // thread
      threadTitle: 'المحادثة',
      pathLabel: 'وصل لهنا من:',
      contactLabel: 'وسيلة التواصل',
      noPhone: 'مفيش رقم',
      /**
       * The button under the name. `wa.me`, never a `tel:` — asked for by name.
       *
       * Masdar, like every other verb on the dashboard since #180: «كلّمه» is
       * an imperative and grows a ي in the feminine.
       */
      whatsapp: 'مراسلته على واتساب',
      /** The name links here when the thread belongs to a real account. */
      openProfile: 'فتح الملف الكامل',
      replyLabel: 'ردّك',
      replyPlaceholder: 'الرد على الطالب…',
      reply: 'إرسال الرد',
      replying: 'بنبعت…',
      replyFailed: 'مقدرناش نبعت الرد. نحاول تاني.',

      /* ── المرفقات ────────────────────────────────────────────────────
       *
       * One button, both kinds — a picture and a PDF are the same gesture, and
       * making him choose an «صورة» button from a «ملف» button is a decision
       * the file extension already answered.
       *
       * `attachHint` names the ceilings the API actually enforces rather than
       * a round number, for the reason the media library's hint does: the one
       * time they disagree is the time someone waits out a 90-second upload to
       * be told no.
       *
       * Masdar throughout — «إرفاق» not «ارفق», «إزالة» not «شيل» — under the
       * rule #180 extended to the whole dashboard: the reader is not
       * necessarily him, and the product should not speak in two voices on
       * adjacent screens.
       */
      attach: 'إرفاق ملف',
      attachHint: 'صورة (٨ ميجا) أو PDF / PowerPoint / Word / Excel (٩٥ ميجا)',
      attaching: 'بنرفع…',
      attachRemove: 'إزالة الملف',
      attachTooLarge: 'الملف كبير أوي.',
      attachBadType: 'نوع الملف ده مش مدعوم.',
      attachFailed: 'مقدرناش نرفع الملف. نحاول تاني.',
      /** Alt text on an attached picture, in a transcript that already names the sender. */
      attachmentImageAlt: 'الملف المرفق',
      /** The download link on a file card. */
      attachmentDownload: 'تحميل',
      close: 'قفل المحادثة',
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
       * The badge counts UNREAD threads — the same rule the inbox's default
       * filter uses, and the same rule the row's accent border uses — so
       * glancing at the number and opening the screen can never disagree.
       *
       * It counted «محتاجة رد» until 2026-08-18. That number only went down
       * when he typed something, so a question he had read and decided needed
       * no answer sat in the badge forever: «مش عايز إنها لازم أرد عشان تبقى
       * اسمها مقروءة». «محتاجة رد» is still a tab; it is just not what a badge
       * on an inbox means.
       */
      /** `{n}` — unread threads. Screen-reader text for the badge. */
      badgeLabel: '{n} رسالة جديدة',
      /** The OS/toast notification when a new message lands. */
      alertTitle: 'رسالة جديدة في صندوق الوارد',
      /** `{n}` — how many arrived since the last check. */
      /* Nominal, not «مقرتهاش» — that is a 2nd-person verb and it grows a ي in
         the feminine, which is exactly what #180 removed from the rest of the
         dashboard. «مش مقروءة» describes the message rather than the reader. */
      alertBodyOne: 'في رسالة جديدة مش مقروءة.',
      alertBodyMany: 'في {n} رسايل جديدة مش مقروءة.',
      alertOpen: 'فتح الوارد',
      /** The header toggle that asks the browser for notification permission. */
      alertsEnable: 'تفعيل تنبيهات الرسايل',
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
    relatedTitle: 'الموضوع ده كامل في كورس',
    relatedBody: 'الكلام اللي فوق ده مقدّمة. الشرح الكامل بالفيديو والتمارين والاختبارات في «{course}».',
    relatedCta: 'فتح الكورس',
    /** Shown instead of `related*` when the article has no course attached. */
    fallbackTitle: 'نبدأ من الأول',
    fallbackBody: 'لو المقالة دي عجبتك، المنهج كامل مرتّب بالصف والمسار — والكورسات كلها مجانية.',
    fallbackCta: 'الكورسات المتاحة',
    /** `aria-label` on the article list. */
    listLabel: 'قائمة المقالات',
  },

  quiz: {
    /** The two papers of a course exam, as the student sees them named. */
    papers: { original: 'الامتحان الأصلي', improvement: 'امتحان التحسين' },
    hint: 'مراجعة الإجابات كويس قبل التسليم.',
    start: 'نبدأ الامتحان',
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
    startFailed: 'مقدرناش نبدأ الامتحان دلوقتي. مفيش محاولة اتحرقت خالص — تأكيد على النت ونجرّب تاني.',
    resume: 'نكمّل امتحانك',
    attemptNo: 'المحاولة رقم {n}',
    /** Stated on the intro of every quiz that is not an improvable exam. */
    singleAttempt: 'محاولة واحدة',
    /** …and on the ones that are. */
    twoAttempts: 'محاولة + تحسين',
    /**
     * …and what the SAME tile says once there is no sitting left.
     *
     * The tile answers "how many goes do I get", and it answered it with the
     * allowance — «١ · محاولة واحدة» — on a screen the student can only be
     * looking at because they have already used it: «هنا أصلاً ملكش ولا
     * محاولة، ومكتوب المحاولات ١». It now counts what is LEFT, which on that
     * screen is none.
     *
     * Not the same string as `noAttemptsLeft` even though both describe the
     * same fact: that one is the SENTENCE in the place the start button would
     * be («الامتحان ده اتقدّم خلاص»), this one is a tile's label under a «٠».
     * Repeating the sentence twelve pixels above itself is not emphasis.
     */
    noSittingsLeft: 'مفيش محاولات تانية',
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
    clearAnswer: 'مسح إجابتي',
    navigator: 'خريطة الأسئلة',
    saving: 'بيتحفظ…',
    saved: 'اتحفظ',
    saveFailed: 'مقدرناش نحفظ إجابتك — بنحاول تاني',
    staleTab: 'الامتحان ده مفتوح في مكان تاني. تحديث الصفحة عشان نكمّل من هنا.',
    submit: 'تسليم الامتحان',
    submitConfirmTitle: 'نسلّم الامتحان؟',
    submitConfirmBody: 'بعد التسليم مش هتقدر تغيّر إجاباتك.',
    submitConfirmUnanswered: 'لسه فيه {count} سؤال من غير إجابة.',
    submitConfirmAllAnswered: 'جاوبت على كل الأسئلة.',
    submitCancel: 'الرجوع للأسئلة',
    submitConfirmAction: 'أيوه، نسلّم',
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
    leaveTitle: 'الخروج من الامتحان؟',
    leaveBody: 'إجاباتك محفوظة، بس الوقت هيفضل ماشي بره. والرجوع للكمالة من نفس المكان ممكن قبل ما الوقت يخلص.',
    /** The safe answer, and the one the dialog focuses — same rule as
     *  `submitCancel`: the way back into the exam takes zero thought. */
    leaveStay: 'نكمّل الامتحان',
    leaveConfirm: 'الخروج من الامتحان',
    timeUpTitle: 'الوقت خلص',
    timeUpBody: 'امتحانك اتسلّم تلقائيًا.',
    graceRemaining: 'الوقت خلص — فاضل {seconds} ثانية للتسليم.',
    checkAnswer: 'عرض الإجابة',
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
    /**
     * The verdict on a sitting that came in under the pass mark — a STATE, not
     * an instruction.
     *
     * It read «محتاجة محاولة تانية» until #179, and that is a promise this
     * platform stopped keeping: every quiz is one graded sitting (see
     * `DEFAULT_REVIEW_OPTIONS`'s note on why the practice mode was removed,
     * and `attemptAllowance`). So the badge sat on the results screen of an
     * exam whose own headline said «الامتحان ده اتقدّم خلاص», telling a student
     * to do the one thing the server would refuse — «ما يبقاش فيها أصلاً
     * محتاجة محاولة تانية، يبقى راجع بس».
     *
     * «محتاجة مراجعة» is true wherever it renders: on a spent lecture quiz the
     * only move left IS to go back over it, and on an exam that still offers
     * an improvement sitting the invitation to sit it is a separate, actual
     * button («دخول امتحان التحسين») rather than a word in a badge.
     */
    failed: 'محتاجة مراجعة',
    passMark: 'درجة النجاح {percent}%',
    noAttemptsLeft: 'الامتحان ده اتقدّم خلاص',
    closed: 'الامتحان قفل',
    notOpenYet: 'الامتحان لسه مفتحش',
    notEnrolled: 'الامتحان للمشتركين في الكورس بس',
    previousAttempts: 'محاولاتك السابقة',
    bestScore: 'أعلى درجة',
    essayPending: 'إجابتك المقالية عند المدرّس للتصحيح',
    wordCount: '{n} كلمة',
    typeAnswer: 'إجابتك هنا',
    chooseOne: 'إجابة واحدة بس',
    chooseMany: 'كل الإجابات الصحيحة',
    true: 'صح',
    false: 'خطأ',
    /* ── Ordering ────────────────────────────────────────────────────────── */
    /** Above the list. Says both gestures, because the drag is the discoverable
     *  one and the buttons are the one that works on a phone with a screen
     *  reader — a student who cannot drag must not have to guess. */
    orderInstruction: 'ترتيب العناصر بالسحب، أو بأزرار التحريك',
    /** On the per-row controls. «فوق»/«تحت» and not «قبل»/«بعد»: the list is
     *  vertical, and in an RTL page «قبل» is the ambiguous one. */
    moveUp: 'حرّك لفوق',
    moveDown: 'حرّك لتحت',
    /** Announced after every move, for a student who cannot see the list
     *  reflow. `{item}` is the option's own text, stripped of markup. */
    movedTo: '{item} — المركز {position} من {total}',
    /** The two lists on the review screen. The student's own order is shown
     *  even when it is right, because «صح» without seeing what you wrote
     *  teaches nothing. */
    yourOrder: 'ترتيبك',
    rightOrder: 'الترتيب الصحيح',
    /** All-or-nothing, said before the student starts rather than after they
     *  are graded — a half-right sequence scores zero, and that is the kind of
     *  rule that has to be visible on the question itself. */
    orderAllOrNothing: 'السؤال ده بيتصحح كامل — الترتيب لازم يبقى مظبوط كله',
    /** The join/split delimiter between multiple option bodies in a
     *  right-answer/response summary (e.g. "أ، ب") — a formatting
     *  primitive, not a message, but still Arabic-locale punctuation and so
     *  lives here rather than as a bare literal in `apps/api`/`apps/web`. */
    answerListSeparator: '، ',
    blockedTitle: 'الامتحان مش متاح دلوقتي',
    /** On `/quizzes/:lessonId`, opening the review for one past attempt. Also
     *  the per-quiz action on `/results`. */
    reviewAnswers: 'مراجعة الإجابات',
    /** Replaces `start` on an improvable exam the student has already sat. */
    improveExam: 'دخول امتحان التحسين',
    /** The improvement sitting exists but has been used. */
    improveUsed: 'محاولة التحسين اتستعملت',
    /** Marks which of two sittings is the one that counts. */
    counts: 'الدرجة المحتسبة',
    /** The review screen's filter, and what it says when nothing is wrong. */
    wrongOnly: 'الغلطات بس',
    showAll: 'كل الأسئلة',
    wrongCount: '{n} غلط من {total}',
    allCorrect: 'مفيش ولا غلطة — ورقة كاملة',
    scoreBandExcellent: 'أداء ممتاز',
    scoreBandGood: 'أداء كويس',
    scoreBandNeedsWork: 'محتاج مراجعة للدرس تاني',
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
    title: 'قبل البداية',
    intro: 'الكلام ده يستاهل دقيقة قراية.',
    focusTitle: 'تركيز في كل سؤال',
    focusBody: 'الامتحان بيتفتح مرة واحدة، ومفيش رجوع بعد التسليم.',
    recordedTitle: 'درجتك هتتسجّل',
    recordedBody: 'النتيجة بتتحفظ في سجلك وبتفضل فيه — مش بتتمسح ولا بتترجع.',
    onceTitle: 'محاولة واحدة بس',
    onceBody: 'الكويز ده ليه محاولة واحدة. حلّه وانت مركّز.',
    onceExamBody: 'دي محاولتك الأصلية. بعدها فيه محاولة تحسين واحدة، وأعلى درجة هي اللي بتتحسب.',
    timedBody: 'الامتحان {minutes} دقيقة من أول دوسة على «نبدأ»، والوقت بيمشي حتى لو الصفحة اتقفلت.',
    untimedBody: 'مفيش وقت محدد، بس المحاولة بتفضل مفتوحة لحد ما تتسلّم.',
    agree: 'تمام، نبدأ الامتحان',
    cancel: 'مش دلوقتي',

    improveTitle: 'امتحان التحسين',
    improveIntro: 'قبل الدخول، في حاجتين لازم يكونوا معروفين.',
    improveDifferentTitle: 'الأسئلة هتكون مختلفة',
    improveDifferentBody: 'ده امتحان تاني بأسئلة غير اللي فاتت. مذاكرة الأول، والاعتماد على اللي فات مش هينفع.',
    improveSafeTitle: 'درجتك الحالية في أمان',
    improveSafeBody: 'أعلى درجة في الاتنين هي اللي بتتحسب. ولو الدرجة طلعت أقل، الأولى هي اللي هتفضل.',
    improveOnceBody: 'ودي فرصتك الوحيدة للتحسين — مفيش محاولة تالتة.',
    improveAgree: 'تمام، نبدأ التحسين',
  },
  quizErrors: {
    exactlyOneCorrect: 'لازم تحدد إجابة صحيحة واحدة بالظبط',
    atLeastTwoOptions: 'لازم يكون فيه اختيارين على الأقل',
    trueFalseNeedsTwo: 'سؤال صح وخطأ لازم يكون له اختيارين بالظبط',
    multiWeightsMustSumToOne: 'مجموع أوزان الإجابات الصحيحة لازم يساوي 1',
    multiNeedsPositive: 'لازم يكون فيه إجابة صحيحة واحدة على الأقل',
    shortAnswerNeedsFullCredit: 'لازم يكون فيه نموذج إجابة واحد على الأقل بوزن 1',
    patternRequired: 'نموذج الإجابة لسه فاضي',
    patternTooLong: 'نموذج الإجابة طويل جدًا',
    tooManyWildcards: 'نموذج الإجابة فيه علامات * كتير جدًا',
    stemRequired: 'نص السؤال لسه فاضي',
    optionBodyRequired: 'نص الاختيار لسه فاضي',
    essayHasNoOptions: 'السؤال المقالي مالوش اختيارات',
    /** Three, not two — with two items a guess is a coin flip, and the
     *  question wanted to be true/false. See `OrderingSchema`. */
    orderingNeedsThree: 'سؤال الترتيب لازم يكون فيه 3 عناصر على الأقل',
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
      'التواصل معانا من أي حساب من حسابات التواصل المذكورة في آخر الصفحة.',

    collectTitle: 'البيانات اللي بنجمعها',
    collectAccount: 'بيانات الحساب',
    /**
     * ⚠️ This sentence enumerates exactly what `/register` asks for, and it is
     * a PUBLISHED legal page — changing the sign-up form without changing this
     * line makes the privacy policy untrue.
     *
     * Rewritten when the phone became the account identifier: it used to say
     * «الاسم والبريد الإلكتروني وكلمة السر», which stopped being accurate the
     * moment the email became optional and the number became required.
     */
    collectAccountBody:
      'الاسم ورقم الموبايل وكلمة السر. البريد الإلكتروني اختياري — ممكن يفضل فاضي والتسجيل بيكمّل عادي. كلمة السر بتتخزّن مشفّرة ومحدش يقدر يقراها، ولا إحنا. ولو الحساب فيه صورة شخصية، بتتخزّن عندنا لحد ما تتشال أو تتغيّر.',
    collectProfile: 'بيانات الطالب',
    /**
     * ⚠️ This sentence is a factual claim about a form, and it went stale the
     * moment the form changed. It said «اسم المدرسة (اختياري)»; `schoolName`
     * became required in f672e20, so the policy was telling a student they
     * could skip a field the wizard would then refuse to move past.
     *
     * A privacy policy that is wrong about what it collects is worse than no
     * policy — this page exists BECAUSE Search Console flagged the domain
     * under «الصفحات المضلّلة», and "we asked for less than we did" is exactly
     * the shape of that accusation. Anything that changes what `/onboarding`
     * requires has to change this line in the same commit.
     */
    collectProfileBody:
      'الاسم الكامل، النوع، رقم الهاتف، المحافظة، اسم المدرسة، ونوع المدرسة (عام ولا لغات) والصف الدراسي. دي بنستخدمها عشان نعرف نعرضلك الكورسات اللي تخص صفك بالظبط.',
    collectParents: 'رقم تليفون ولي الأمر',
    /**
     * Same correction, and a bigger one: this described TWO optional fields
     * («حقلين اختياريين تماماً — ممكن يفضلوا فاضيين والتسجيل بيكمّل عادي»).
     * The mother's number stopped being asked for at all, and the remaining
     * one became REQUIRED in f672e20 — so the policy described a form with one
     * more field than exists and a rule that is the opposite of the truth.
     *
     * The «مابنبعتلهمش حاجة لحد دلوقتي» half is kept, because it is still true
     * and it is the part that actually reassures anybody.
     */
    collectParentsBody:
      'رقم واحد، وإجباري — عشان نقدر نتواصل مع ولي الأمر بخصوص مستوى الطالب لو احتجنا. وللأمانة: لحد النهاردة مابنبعتلهوش أي حاجة ومابنستخدمهوش في أي غرض تاني، وأكيد مابنبيعهوش ولا بنشاركهوش مع حد.',
    collectProgress: 'تقدّمك في الدراسة',
    collectProgressBody:
      'المحاضرات اللي فتحتها وخلّصتها، مدة المشاهدة، ومحاولات الاختبارات ودرجاتها. ده اللي بيخلّي شريط التقدّم والنتايج شغّالين.',
    collectTechnical: 'بيانات تقنية',
    collectTechnicalBody:
      'الأجهزة اللي الحساب دخل منها عشان تبان وتتقفل من الإعدادات، وسجلّ للعمليات الإدارية على المنصة.',

    neverTitle: 'حاجات مابنجمعهاش',
    neverBody:
      'مابنطلبش الرقم القومي، ولا أي بيانات بنكية أو أرقام كروت، ولا صور مستندات رسمية. المنصة مجانية ومفيش أي مدفوعات فيها أصلاً.',

    shareTitle: 'مين تاني بيشوف البيانات',
    shareBody: 'مابنبيعش بياناتك ومابنأجرهاش لحد، ومابنستخدمهاش في إعلانات. الأطراف التانية الوحيدة اللي ليها علاقة بالموقع:',
    shareCloudflare:
      'كلاودفلير — بتقدّم الموقع وبتحميه، وبتجمع إحصائيات زيارات مجمّعة من غير كوكيز تتبّع.',
    shareYoutube:
      'يوتيوب — الفيديوهات متشغّلة من نطاق youtube-nocookie، وهو الوضع اللي بيمنع يوتيوب من حط كوكيز تتبّع قبل ما الفيديو يشتغل.',
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
      'في أي وقت بياناتك بتتشاف وتتعدّل من صفحة الملف الشخصي، وأي جهاز داخل بحسابك بيتقفل من الإعدادات. ولو فيه طلب لمسح الحساب وكل البيانات المرتبطة بيه، رسالة لنا وهنعملها. البيانات بتفضل متخزّنة طول ما الحساب موجود.',

    minorsTitle: 'الطلبة تحت ١٨ سنة',
    minorsBody:
      'المنصة موجّهة لطلبة الثانوي، فأغلب المستخدمين قاصرين. وأي ولي أمر عايز يشوف بيانات ابنه أو يطلب مسحها — التواصل معانا والرد بيجي.',

    changesTitle: 'لو الصفحة دي اتغيّرت',
    changesBody:
      'لو غيّرنا حاجة جوهرية في اللي بنجمعه أو بنستخدمه فيه، هنحدّث الصفحة دي وهنغيّر تاريخ آخر تحديث اللي فوق.',

    termsUseTitle: 'استخدام المنصة',
    termsUseBody:
      'الحساب شخصي — يخص طالب واحد. مشاركة بياناتك مع حد تاني بتعرّض الحساب للإيقاف. المنصة بتسجّل الأجهزة اللي بيتم الدخول منها، وكلها بتبان وأي واحدة بتتقفل من الإعدادات.',
    termsContentTitle: 'المحتوى',
    termsContentBody:
      'الفيديوهات والملفات والاختبارات كلها ملك أيمن أبو العلا. الاستخدام للمذاكرة الشخصية بس، ومينفعش إعادة نشرها أو توزيعها أو بيعها.',
    termsQuizTitle: 'الاختبارات',
    termsQuizBody:
      'كل كويز ليه محاولة واحدة، ودرجتها بتتسجّل في سجلك وبتفضل فيه. الاستثناء الوحيد هو الامتحان النهائي بتاع الكورس: ليه محاولة تحسين واحدة بأسئلة مختلفة، وأعلى درجة في الاتنين هي اللي بتتحسب.',
    termsAvailabilityTitle: 'التوفّر',
    termsAvailabilityBody:
      'بنحاول المنصة تفضل شغّالة طول الوقت، بس ممكن تقف لصيانة أو لظرف خارج عن إرادتنا. مفيش ضمان بتوفّر مستمر ١٠٠٪.',
    termsTerminationTitle: 'إيقاف الحساب',
    termsTerminationBody:
      'ممكن نوقف حساب لو اتخالفت الشروط دي — زي مشاركة الحساب أو إعادة نشر المحتوى. وتقدر انت كمان تطلب مسح حسابك في أي وقت.',

    seeAlsoPrivacy: 'سياسة الخصوصية',
    seeAlsoTerms: 'شروط الاستخدام',
    backHome: 'الرجوع للرئيسية',
    /**
     * The way out, for a student who arrived here mid-signup.
     *
     * `backHome` is the only exit these pages had, it sat at the very BOTTOM
     * of a document several screens long, and it went to the marketing home
     * page — which for someone three steps into the account form is not "back"
     * by any reading. «دخلت على سياسة الخصوصية من تحت، أنا مش قادر إن أنا
     * أرجع». This one names the place they actually came from and is rendered
     * at the TOP, before the policy rather than after it.
     */
    backToOnboarding: 'الرجوع لإكمال بياناتك',
  },

  /**
   * `/links` — the one URL that goes in a YouTube, Facebook, TikTok and
   * Instagram bio, because each of those allows exactly one.
   *
   * ## Why the strings here are so short
   *
   * This page is read on a phone, one-handed, seconds after a tap out of a
   * video. Nothing on it is a paragraph: every row is a title and one line
   * saying where the tap lands. The long-form versions of these ideas already
   * exist on `/about` and the landing page, and a bio page that repeats them
   * is a page nobody finishes.
   *
   * ## What is deliberately NOT written here
   *
   * The account handles — «@2ayman6» and the rest. They are DERIVED from the
   * URLs in `site-profiles.ts` at render time, not typed again here, because a
   * handle written in two places is a handle that will eventually disagree
   * with the link beside it. On a page whose whole job is «ده هو حسابه
   * الرسمي», a handle that does not match its own href is the one error that
   * matters.
   */
  linkhub: {
    /** The `<h1>`. The bare NAME — this is a profile card and it leads with whose. */
    title: 'أيمن أبو العلا',
    /**
     * The `<title>`, and deliberately NOT the name.
     *
     * `/about` was built to win a search for «أيمن أبو العلا» without competing
     * with the homepage; a third page titled with those same three words would
     * put the site in a race against itself for the one query it most wants.
     * This one says what the page is FOR, which is also the honest answer to
     * why a visitor would open it.
     */
    pageTitle: 'كل اللينكات',
    role: 'مدرّس البرمجة وعلوم الحاسب — البكالوريا المصرية',
    /**
     * Sits under the name like a verification badge. It is a true statement —
     * these are the accounts, and this page is on his own domain — and it is
     * the reason the page exists: students find copies of his content on pages
     * that are not his.
     */
    verified: 'الحسابات الرسمية',
    lead: 'كل حاجة في مكان واحد: المنصة، والقنوات، والتواصل.',
    /** ≤160 characters, for the meta description and the share card. */
    description:
      'كل حسابات ولينكات المهندس أيمن أبو العلا في مكان واحد — المنصة والكورسات، يوتيوب وإنستجرام وتيك توك وفيسبوك، وقناة الواتساب.',

    groupPlatform: 'المنصة',
    groupFollow: 'تابعه',
    groupTalk: 'التواصل',

    coursesTitle: 'الكورسات',
    coursesNote: 'كل محاضرات البرمجة وعلوم الحاسب، مرتّبة بالصف',
    registerTitle: 'حساب مجاني في دقيقة',
    registerNote: 'الحساب بياخد دقيقة، وأول محاضرة مفتوحة على طول',
    essentialsTitle: 'التأسيس',
    essentialsNote: 'قبل أول سطر كود — الأساسيات من الصفر',
    newsTitle: 'نيوز',
    newsNote: 'مقالات قصيرة بالعربي، وبأمثلة كود شغّالة',
    aboutTitle: 'مين أيمن أبو العلا؟',
    aboutNote: 'الحكاية كاملة، والكورسات اللي بيدرّسها',

    whatsappChannelTitle: 'قناة الواتساب',
    whatsappChannelNote: 'أول ما ينزل درس أو يتحدد ميعاد امتحان، هيوصلك',
    whatsappTitle: 'التواصل على واتساب',
    whatsappNote: 'لو عندك سؤال عن الاشتراك أو المحتوى',
    facebookGroupTitle: 'جروب الطلبة',
    facebookGroupNote: 'الطلبة بيسألوا وبيساعدوا بعض',
    telegramTitle: 'تيليجرام',
    telegramNote: 'نفس الإعلانات، لو بتفضّل تيليجرام',

    /**
     * Appended, screen-reader-only, to every row that leaves this origin.
     *
     * `target="_blank"` with no warning is a WCAG 3.2.5 finding, and on this
     * page it is also just true and worth saying: the whole point of the row is
     * that the page it opens is somewhere else.
     */
    opens: 'يفتح في تبويب جديد',
    site: 'الموقع الرسمي',
  },
} as const;

export type Copy = typeof copy;
