/**
 * «رسايل الواتساب التلقائية» — the dashboard side of the two automatic kinds
 * (`checkout_recovery`, `signup_nudge`): the card on `/admin/outreach`, its
 * settings rows, the log labels, and the campaign picker's «لم يشترك في أي
 * كورس» box.
 *
 * A module of its own rather than more keys in `copy/admin.ts`, for the reason
 * `copy/admin-practice.ts` gives: a tab left open from an older build has no
 * module id for a path that did not exist when it loaded, and the admin table
 * is already the largest file in the package.
 *
 * ⚠️ Addresses nobody, like the rest of the dashboard: masdars on buttons,
 * nominal hints, and nothing that genders the STUDENT being described either
 * (CLAUDE.md §7, memory `no-gendered-address-to-students`).
 *
 * `{n}`, `{cap}`, `{date}` go through `formatCopy`.
 */
export const adminAutoOutreach = {
  eyebrow: 'من غير ما حد يدوس',
  title: 'رسايل الواتساب التلقائية',
  lead: 'رسالتين بيتبعتوا لوحدهم من الرقم المربوط وفي شات المنصة: تذكير لما صفحة دفع تتفتح ومتكمّلش، وترحيب لحساب جديد مافيهوش اشتراك في أي كورس. كل رسالة مرة واحدة بس لكل طالب.',

  // ── the status band ────────────────────────────────────────────────
  deviceLabel: 'الرقم',
  device: {
    connected: 'مربوط وشغّال',
    linking: 'بيتربط دلوقتي',
    disconnected: 'مش مربوط',
    unreachable: 'مش بيرد',
    disabled: 'مفيش رقم متضبط',
  },
  /** Shown when nothing can go out — and why nothing is lost meanwhile. */
  devicePaused: 'مفيش ولا رسالة بتتبعت دلوقتي، ومفيش حاجة بتتحسب «اتبعتت». أول ما الرقم يتربط، اللي لسه في وقته بيتبعتله لوحده.',
  linkDevice: 'ربط الرقم',
  windowOpen: 'وقت الإرسال (١٠ الصبح لـ١٠ بالليل)',
  windowClosed: 'برا وقت الإرسال — بيكمّل الساعة ١٠ الصبح',
  /** `{n}` sent today, `{cap}` the ceiling. */
  todayLine: '{n} من {cap} النهارده',
  todayHint: 'سقف يومي للرسايل دي بالذات، عشان رقم جديد مايتقفلش',
  dueNowLine: 'مستنيين دلوقتي: {checkout} تذكير دفع · {signup} ترحيب',

  // ── the two kind cards ─────────────────────────────────────────────
  checkoutTitle: 'كمّل الدفع',
  checkoutLead: 'صفحة دفع اتفتحت ومااتكمّلتش — بعد كام ساعة بيوصل لينك بيرجّع لنفس الخطوة بالظبط.',
  signupTitle: 'الحساب جاهز',
  signupLead: 'حساب جديد مافيهوش اشتراك في أي كورس — بعد يوم بيوصل لينك الكورس اللي على سنة الطالب.',
  statWindow: 'آخر ٣٠ يوم',
  checkoutCandidates: 'فتحوا الدفع',
  signupCandidates: 'حسابات جديدة',
  statSent: 'اتبعتلهم',
  statWhatsapp: 'منهم على واتساب',
  statDelivered: 'وصلت فعلاً',
  checkoutConverted: 'دفعوا خلال ٣ أيام',
  signupConverted: 'اشتركوا خلال أسبوع',
  statRevenue: 'فلوس رجعت',

  previewTitle: 'شكل الرسالة',
  previewLead: 'دي الرسالة بالظبط زي ما الطالب هيشوفها — بأسماء ولينكات للتجربة بس.',
  sampleCheckoutCourse: 'تذكير دفع كورس',
  sampleCheckoutBook: 'تذكير دفع كتاب',
  sampleSignup1: 'ترحيب — أول مرة',
  sampleSignup2: 'ترحيب — المرة التانية',

  // ── settings rows (inside the outreach settings form) ───────────────
  settingsHeading: 'رسايل الواتساب التلقائية',
  checkoutRecovery: 'تذكير «كمّل الدفع»',
  checkoutRecoveryHint: 'لما صفحة دفع (كورس أو كتاب) تتفتح ومتكمّلش.',
  checkoutRecoveryAfterHours: 'بعد كام ساعة من فتح الدفع',
  checkoutRecoveryAfterHoursHint: 'من ساعة لـ٤٧. التذكير مش بيتبعت عن دفع اتفتح من أكتر من يومين.',
  checkoutRecoveryEveryDays: 'نفس الكورس أو الطلب مايتفكّرش تاني قبل كام يوم',
  checkoutRecoveryEveryDaysHint: 'لو نفس صفحة الدفع اتفتحت تاني بعد كده.',
  signupNudge: 'ترحيب «الحساب جاهز»',
  signupNudgeHint: 'لحساب جديد مافيهوش اشتراك في أي كورس.',
  signupNudgeAfterHours: 'بعد كام ساعة من التسجيل',
  signupNudgeAfterHoursHint: 'بيشمل الحسابات اللي اتعملت في آخر ٧ أيام بس — القديمة ليها حملة لوحدها.',
  signupNudgeSecondAfterDays: 'رسالة تانية بعد كام يوم',
  signupNudgeSecondAfterDaysHint: '٠ يعني من غير رسالة تانية.',
  autoWhatsappDailyCap: 'أقصى عدد في اليوم',
  autoWhatsappDailyCapHint: 'للرسالتين دول مع بعض، على واتساب.',

  // «نتيجة الامتحان تتبعت لمين» — `outreach.quizResultTo`.
  quizResultTo: 'نتيجة الامتحان تتبعت لمين',
  quizResultToHint:
    'رسالة ولي الأمر بتتبعت على واتساب من الرقم المربوط، على رقم ولي الأمر اللي في ملف الطالب، وفي وقت الإرسال بس. لو الرقم مش موجود أو مش صالح، الطالب بتوصله رسالته هو.',
  quizResultToStudent: 'الطالب',
  quizResultToStudentHint: 'في شات المنصة، زي ما هو دلوقتي.',
  quizResultToGuardian: 'ولي الأمر',
  quizResultToGuardianHint: 'على واتساب، بدل رسالة الطالب.',
  quizResultToBoth: 'الاتنين',
  quizResultToBothHint: 'الطالب في الشات، وولي الأمر على واتساب.',

  // ── the log ────────────────────────────────────────────────────────
  kindCheckoutRecovery: 'كمّل الدفع',
  kindSignupNudge: 'الحساب جاهز',
  /** `{title}` — the course. */
  whyCheckoutCourse: 'دفع «{title}» اتفتح ومااتكمّلش',
  whyCheckoutBook: 'طلب كتاب من غير دفع',
  whySignup1: 'حساب جديد من غير اشتراك',
  whySignup2: 'حساب من غير اشتراك — الرسالة التانية',

  // ── the campaign audience picker ────────────────────────────────────
  audienceNeverSubscribed: 'من غير اشتراك في أي كورس',
  audienceNeverSubscribedHint: 'حسابات مافيهاش اشتراك شغّال في أي كورس ولا دفع مستني مراجعة — للحسابات القديمة اللي الترحيب التلقائي مابيوصلهاش.',
} as const;
