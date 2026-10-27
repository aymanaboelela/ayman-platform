/**
 * «التسويق ← دعوة الصحاب» — the admin's screen.
 *
 * Staff copy, Egyptian Arabic, and the same rule as the student side
 * (CLAUDE.md §7, #180): masdar buttons, and text describing a student never
 * genders them. No instructor name — the copy table is shared and the
 * tenant-identity guard walks it.
 */
export const adminReferralsCopy = {
  tab: 'دعوة الصحاب',
  title: 'دعوة الصحاب',
  lead: 'كل طالب ليه لينك دعوة. أي حساب يتعمل منه ويدفع أول اشتراك حقيقي، صاحب اللينك والحساب الجديد بياخدوا رصيد في المحفظة.',

  settingsTitle: 'إعدادات البرنامج',
  enabled: 'البرنامج شغال',
  enabledHint: 'وهو واقف مفيش تسجيل بيتحسب ولا مكافأة بتنزل. اللي اتحسب قبل كده بيفضل زي ما هو.',
  referrerReward: 'مكافأة صاحب اللينك (جنيه)',
  friendReward: 'مكافأة الحساب الجديد (جنيه)',
  monthlyCap: 'أقصى مكافآت للطالب الواحد في الشهر',
  windowDays: 'مدة اللينك بعد الضغط عليه (يوم)',
  whatsappNotice: 'رسالة واتساب لصاحب اللينك لما المكافأة تنزل',
  whatsappHint:
    'بتتبعت من الجهاز المربوط بس. لو مفيش جهاز مربوط مفيش حاجة بتتبعت ولا بتتعلّم إنها اتبعتت، وبعد الربط بتتبعت للمكافآت اللي نزلت آخر ٣ أيام بس. المكافأة نفسها مالهاش علاقة بالواتساب.',
  save: 'حفظ الإعدادات',
  saving: 'بيتحفظ…',
  saved: 'اتحفظ',
  invalid: 'فيه رقم مش مظبوط في الإعدادات',
  failed: 'حصل خطأ، نجرّب تاني',
  alreadyClosed: 'الدعوة دي اتقفلت قبل كده — تحميل الصفحة تاني بيبيّن حالتها.',

  totalsJoined: 'تسجيل من غير دفع',
  totalsCredited: 'مكافآت نزلت',
  totalsCreditedCents: 'إجمالي الرصيد اللي نزل',
  currency: 'جنيه',
  totalsReversed: 'اترجعت',
  totalsBlocked: 'اترفضت',
  totalsVoided: 'اتلغت',

  listTitle: 'كل الدعوات',
  filterAll: 'الكل',
  colReferrer: 'صاحب اللينك',
  colReferred: 'الحساب الجديد',
  colStatus: 'الحالة',
  colReward: 'المكافأة',
  colDate: 'التاريخ',
  empty: 'لسه مفيش دعوات.',
  /** `{referrer}` / `{friend}` — the two rewards, in pounds. */
  rewardPair: '{referrer} + {friend} جنيه',
  /** `{amount}` — what actually came back from the two wallets. */
  reversedAmount: 'رجع {amount} جنيه',
  status: {
    joined: 'تسجيل بس',
    credited: 'المكافأة نزلت',
    reversed: 'اترجعت',
    blocked: 'اترفضت',
    voided: 'اتلغت',
  },
  blockReason: {
    self: 'نفس الحساب',
    same_phone: 'نفس رقم التليفون',
    guardian_phone: 'نفس رقم ولي الأمر',
    monthly_cap: 'عدّى حد الشهر',
    banned: 'حساب محظور',
  } as Record<string, string>,
  notice: {
    sent: 'الواتساب اتبعت',
    sending: 'الواتساب بيتبعت',
    opted_out: 'طلب إيقاف الواتساب',
    no_phone: 'مفيش رقم واتساب',
    not_on_whatsapp: 'الرقم مش على واتساب',
  } as Record<string, string>,

  voidAction: 'إلغاء',
  voidTitle: 'نلغي الدعوة دي؟',
  voidHint: 'لو المكافأة نزلت، بترجع من المحفظتين على قد الرصيد اللي فيهم دلوقتي.',
  voidReason: 'السبب',
  voidReasonPlaceholder: 'مثلًا: نفس الطالب بحسابين',
  voidConfirm: 'إلغاء الدعوة',
  voidCancel: 'رجوع',
  voided: 'الدعوة اتلغت',

  topTitle: 'أكتر الطلبة دعوة',
  topEmpty: 'لسه مفيش مكافآت نزلت.',
  /** `{joined}` signed up, `{credited}` rewarded. */
  topCounts: '{joined} سجّلوا · {credited} مكافأة',

  prev: 'اللي قبل',
  next: 'اللي بعد',
  /** `{page}` / `{pages}`. */
  pageOf: 'صفحة {page} من {pages}',
} as const;
