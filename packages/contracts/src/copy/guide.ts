/**
 * «مرشد الاشتراك» — the first-visit guide: the dialog that walks a new visitor
 * from «which year?» to the checkout, and the helper circle that keeps talking
 * on the register page and beside the real payment steps.
 *
 * ## Nobody here is a boy or a girl
 *
 * Same rule as the rest of the table (CLAUDE.md §7, `copy/ar.ts` header), and
 * it matters more here than anywhere: this is the FIRST thing the platform
 * says to somebody, out loud. Everything with a voice is the inclusive plural
 * («نختار»، «نكتب»، «نحوّل»), buttons are masdars or the same plural, and the
 * only ـك is on a noun. `guide-voice.spec.ts` is the tripwire.
 *
 * ## No instructor name
 *
 * The one line that introduces the teacher carries `{name}`, filled by the web
 * from `tenantName(copy.site.instructor)`. Nothing in this file names anybody,
 * so it is scanned by `tenant-identity-leak.spec.ts` like any other module
 * rather than exempted from it.
 *
 * ## `voice` is a recording script, and that shapes how it is written
 *
 * Every entry under `voice` is recorded once, in the teacher's own voice, and
 * played to every student. So a line there:
 *
 *   · carries NO variable data — no price, month name, course title or
 *     student name. Those are on the screen, in the rows the line points at;
 *   · makes sense heard with the screen off;
 *   · stays under ~160 characters, one breath;
 *   · is keyed by what becomes its FILE NAME (`/guide-voice/<key>.mp3`), so
 *     keys are `[a-z0-9-]` only and are never renamed once recorded — a
 *     renamed key is a clip that silently stops playing.
 *
 * Changing the WORDS of a recorded line means re-recording it; the text and
 * the clip disagreeing is worse than either being imperfect.
 * `docs/guide-voice/voice-lines.json` is the script handed to the recording,
 * and a web test fails when it and this table drift apart.
 */
export const guideCopy = {
  /** The dialog's accessible name, and the helper circle's. */
  label: 'مرشد الاشتراك',
  /** `{n}` of `{total}` — under the teacher's name in the journey band. */
  stepOf: 'خطوة {n} من {total}',
  minimise: 'تصغير',
  close: 'قفل',
  back: 'رجوع',
  /** The welcome step's way out that keeps the pill for the session. */
  later: 'بعدين',
  /** The minimised pill. `{name}` — the teacher, through `tenantName`. */
  pill: 'نكمّل الاشتراك مع {name}',
  /** The play button beside a spoken line, and its two other states. */
  listen: 'تشغيل الصوت',
  stopVoice: 'إيقاف الصوت',
  mute: 'كتم الصوت',
  unmute: 'تشغيل الصوت تاني',
  loading: 'لحظة واحدة…',
  loadFailed: 'البيانات ماحمّلتش. المشكلة عندنا مش عندك.',
  retry: 'محاولة تانية',

  /** The stations on the road — one or two words each, they sit under dots. */
  stations: {
    welcome: 'أهلًا',
    year: 'الصف',
    stream: 'الشعبة',
    course: 'الكورس',
    plan: 'الباقة',
    month: 'الشهر',
    account: 'الحساب',
    pay: 'الدفع',
  },

  welcome: {
    title: 'نختار الكورس ونشترك في دقيقتين',
    hint: 'أسئلة بسيطة بالاختيار، والسعر واضح قبل أي دفع.',
    start: 'يلا نبدأ',
  },
  year: {
    title: 'الصف الدراسي إيه؟',
  },
  stream: {
    /**
     * «البرمجة بندرسها…» — the question is about the language the SUBJECT is
     * studied in, not about the school, and on a stack that teaches code the
     * subject is named. «بندرسها», the inclusive plural — never «بتدرس».
     */
    title: 'البرمجة بندرسها عربي ولا لغات؟',
    /** The same question on a stack whose subject is not programming. */
    titleNeutral: 'الدراسة عربي ولا لغات؟',
    generalSub: 'المنهج بالعربي',
    languagesSub: 'المنهج باللغات',
  },
  /**
   * The on-screen text of the `stream` line on a stack that does not teach
   * code. Not part of the recording script: those stacks have no clips, and
   * the recorded line names «البرمجة».
   */
  streamNeutral: 'تمام. الدراسة عربي ولا لغات؟ نختار عشان الشرح والواجبات تبقى بنفس لغة المنهج.',
  course: {
    title: 'ده الكورس المناسب',
    pickTitle: 'الكورسات المتاحة',
    /** `{count}` — already in Arabic words-and-number form (`arabicCount`). */
    lessons: '{count}',
    next: 'نختار الباقة',
    /** No course is published for what was picked. */
    none: 'لسه مفيش كورس منشور للاختيار ده.',
    /** Back to the year question from that dead end. */
    otherYear: 'صف تاني',
  },
  plan: {
    title: 'الباقة المناسبة إيه؟',
    /** `{course}` — which course these plans belong to. */
    lead: 'باقات «{course}»',
    /**
     * The three ways to subscribe are listed in one fixed order — «شهر», every
     * term by its own name, «السنة كلها» — and each row carries its LIVE price
     * and nothing else. No «أوفر», no «بتوفّر»: a saving is a claim about two
     * prices and a number of months, and the guide does not know how many
     * months a year or a term will turn out to hold.
     */
    /** Under «شهر» when the course sells named curriculum months — the price
     *  beside it is the price of ONE month. */
    monthlyPickSub: 'سعر الشهر الواحد، والشهور نختارها في الخطوة الجاية',
    /** Under «شهر» when it is the plain one-month subscription. */
    monthlySub: 'اشتراك شهر واحد',
    /** The yearly row's name — «السنة كلها», the owner's own word for it. */
    yearlyLabel: 'السنة كلها',
    yearlySub: 'كل شهور السنة باشتراك واحد',
    /** Under a term row — the row's title is the term's own name. */
    termSub: 'كل شهور الترم باشتراك واحد',
    /**
     * A term that exists and is not on sale yet — «الترم التاني» while the
     * first is running. Shown, never selectable, never sent to the checkout.
     */
    notOpenYet: 'لسه ما اتفتحش',
    /** A claim for this course is already waiting for review. */
    pendingAction: 'صفحة الاشتراك',
    /** No plan is on sale for this course right now. */
    noneTitle: 'مفيش باقات معروضة دلوقتي',
    noneAction: 'صفحة الكورس',
  },
  /**
   * «أنهي شهور؟» — one month or several, in ONE transfer. Checkbox rows over
   * the OPEN months only; a month that is closed, or that the student already
   * holds, is not on the list at all.
   */
  month: {
    title: 'الشهور اللي هنشترك فيها',
    hint: 'شهر واحد أو أكتر في نفس التحويل. الشهور المفتوحة بس هي اللي ظاهرة.',
    /** `{price}` — the sum of the chosen months' own live prices. */
    total: 'الإجمالي: {price} جنيه',
    /** In place of the total while nothing is ticked. */
    pickOne: 'نختار شهر واحد على الأقل',
    next: 'التالي',
  },
  /** The summary card on the last step. */
  summary: {
    course: 'الكورس',
    plan: 'الباقة',
    total: 'المطلوب',
    /** `{rails}` — the transfer methods this stack has switched on. */
    rails: 'التحويل بـ{rails}',
    railsJoin: ' أو ',
  },
  /** Last step for a visitor with no account yet. */
  account: {
    title: 'فاضل الحساب والدفع',
    steps: ['إنشاء الحساب، دقيقة واحدة', 'بيانات الدراسة', 'التحويل ورفع صورة الإيصال'],
    create: 'إنشاء الحساب',
    haveOne: 'عندي حساب',
  },
  /** Last step for a signed-in student. */
  pay: {
    title: 'الاختيارات جاهزة',
    steps: ['صفحة الاشتراك', 'التحويل على الرقم', 'رفع صورة الإيصال'],
    go: 'نكمّل للدفع',
  },

  /**
   * The helper circle's own controls. There is no «end» here on purpose: the
   * × folds the bubble away and the circle stays, so a student who closed it
   * by reflex can still get the next field's line back with one tap.
   */
  helper: {
    show: 'إظهار الشرح',
    hide: 'إخفاء الشرح',
    /** Read out with the dot on the circle when a new line is waiting. */
    unread: 'فيه شرح جديد',
  },

  /**
   * The LIVE line under the spoken one: what the field being filled still
   * needs, by the register form's own rules (`guide-status.ts` reads them from
   * the schemas — nothing here states a rule of its own). Text only: it changes
   * with every few keystrokes, so there is nothing to record.
   *
   * `{count}` rows are the four Arabic number forms (`arabicCount`).
   */
  status: {
    nameOk: 'الاسم تمام',
    nameLeft: {
      one: 'باقي كلمة واحدة من الاسم',
      two: 'باقي كلمتين من الاسم',
      few: 'باقي {count} كلمات من الاسم',
      many: 'باقي {count} كلمة من الاسم',
    },
    phoneOk: 'الرقم تمام',
    phoneLeft: {
      one: 'باقي رقم واحد',
      two: 'باقي رقمين',
      few: 'باقي {count} أرقام',
      many: 'باقي {count} رقم',
    },
    phoneBad: 'ده مش رقم موبايل مصري صحيح',
    passwordOk: 'كلمة المرور تمام',
    passwordLeft: {
      one: 'باقي حرف واحد',
      two: 'باقي حرفين',
      few: 'باقي {count} حروف',
      many: 'باقي {count} حرف',
    },
    passwordLong: 'كلمة المرور طويلة جدًا',
    confirmOk: 'الكلمتين زي بعض',
    confirmBad: 'الكلمتين مش زي بعض لسه',
  },

  /**
   * ══ THE RECORDING SCRIPT ══ — see this file's header before touching a key
   * or a word. One entry = one clip = `/guide-voice/<key>.mp3`.
   */
  voice: {
    // ── The dialog ───────────────────────────────────────────────────────
    /** `{name}` is the only placeholder in the whole script. */
    welcome:
      'أهلًا وسهلًا! أنا {name}. هنا عشان نختار الكورس المناسب ونشترك فيه سوا خطوة خطوة، وكل ده في دقيقتين.',
    year: 'أول سؤال: الصف الدراسي. نختار السنة من الاختيارات اللي على الشاشة.',
    /** Says «البرمجة» — a stack that teaches something else shows
     *  `streamNeutral` below as text instead (and has no clips anyway). */
    stream: 'تمام. البرمجة بندرسها عربي ولا لغات؟ نختار عشان الشرح والواجبات تبقى بنفس لغة المنهج.',
    course: 'ده الكورس المناسب للصف والشعبة. فيه شرح المنهج كله بالفيديو، ومتابعة خطوة بخطوة طول السنة.',
    'course-pick': 'دي الكورسات المتاحة للصف والشعبة. نختار الكورس اللي عايزين نبدأ بيه.',
    plan: 'نختار طريقة الاشتراك: بالشهر، أو بالترم، أو السنة كلها مرة واحدة. السعر مكتوب قدام كل اختيار، والترم اللي لسه ما اتفتحش هيتفتح في ميعاده.',
    month:
      'الاشتراك هيبقى بالشهر. نختار شهر واحد أو أكتر من الشهور المفتوحة، والإجمالي بيتحسب قدامنا. وباقي الشهور نقدر نضيفها أول ما تتفتح.',
    'no-plans': 'الكورس ده مفيش عليه باقات معروضة دلوقتي. نفتح صفحة الكورس ونعرف التفاصيل من هناك.',
    account:
      'فاضل خطوتين: الحساب وبعده الدفع. هنروح دلوقتي لصفحة إنشاء الحساب، وأنا موجود هناك في كل خانة.',
    pay: 'كده الاختيارات جاهزة. فاضل الدفع: هنروح لصفحة الاشتراك، نحوّل المبلغ، ونرفع صورة التحويل. وأنا موجود في كل خطوة.',

    // ── The register page, one line per field as it takes focus ──────────
    'register-intro': 'دي صفحة إنشاء الحساب. نملا الخانات واحدة واحدة، وكل خانة هقول محتاجة إيه.',
    'register-name': 'هنا نكتب الاسم ثلاثي على الأقل، بالعربي أو بالإنجليزي، زي ما هو في الأوراق الرسمية.',
    'register-phone': 'هنا رقم الموبايل، ويفضّل يكون عليه واتساب. الرقم ده هو اللي هندخل بيه المنصة كل مرة.',
    'register-email': 'الإيميل اختياري. لو مفيش إيميل نسيب الخانة فاضية ونكمّل عادي.',
    'register-password': 'نختار كلمة مرور نفتكرها بسهولة وحد غيرنا مايعرفهاش، ونحتفظ بيها في مكان آمن.',
    'register-confirm': 'نكتب كلمة المرور نفسها مرة تانية للتأكيد، وبعدها ندوس على إنشاء الحساب.',
    /** The sign-in page, for the visitor who already had an account. */
    login: 'لو فيه حساب معمول قبل كده، ندخل برقم الموبايل وكلمة المرور، ونكمّل الاشتراك على طول.',
    /** The first screen after the account exists. */
    'after-signup':
      'الحساب اتعمل بنجاح! فاضل شوية بيانات بسيطة عن الدراسة والمحافظة، وبعدها نكمّل الاشتراك على طول.',

    // ── Beside the real checkout, one line per step it is on ─────────────
    'checkout-start': 'دي صفحة الاشتراك. نتأكد من الباقة اللي اخترناها، وبعدها نكمّل لخطوة الدفع.',
    'checkout-method': 'نختار طريقة التحويل: إنستاباي أو فودافون كاش، حسب المتاح على الموبايل.',
    'checkout-transfer':
      'ده الرقم اللي هنحوّل عليه. ننسخه، نفتح تطبيق التحويل، ونحوّل المبلغ المكتوب بالظبط، وناخد صورة لشاشة التحويل.',
    'checkout-sender': 'هنا نكتب رقم الموبايل اللي اتحوّل منه المبلغ، عشان التحويل يتعرف بسرعة.',
    'checkout-receipt': 'آخر خطوة: نرفع صورة التحويل من هنا، وبعدها ندوس على إرسال الطلب.',
    'checkout-pending':
      'فيه طلب اشتراك اتبعت قبل كده وبيتراجع دلوقتي. أول ما التحويل يتأكد الكورس هيتفتح وهيوصل إشعار.',
    done: 'تمام كده، الطلب اتبعت! هنراجع التحويل ونفتح الكورس في أسرع وقت، وهيوصل إشعار أول ما يتفتح. بالتوفيق!',
    /** Paid from the wallet — nothing to review, the course is already open. */
    'done-open': 'مبروك! الاشتراك اتفعّل والكورس اتفتح. نبدأ أول درس على طول.',
  },
} as const;

export type GuideVoiceKey = keyof typeof guideCopy.voice;
