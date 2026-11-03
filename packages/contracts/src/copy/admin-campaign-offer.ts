/**
 * «كود خصم لكل يوم» and «ناقصه شهور» — the campaign form's two new blocks,
 * the per-plan coupon on `/admin/coupons`, and the reasons the runner writes
 * when it pauses or skips because of them.
 *
 * A module of its own rather than more keys in `copy/admin.ts`, for the reason
 * `copy/admin-practice.ts` gives: a tab left open from an older build has no
 * module id for a path that did not exist when it loaded.
 *
 * ⚠️ Addresses nobody, like the rest of the dashboard: masdars on buttons,
 * nominal hints, and nothing that genders the STUDENT being described either
 * (CLAUDE.md §7). No instructor name — the tenant-identity guard walks this.
 *
 * `{n}`, `{code}`, `{date}` go through `formatCopy`.
 */
export const adminCampaignOffer = {
  // ── audience: «ناقصه شهور» ─────────────────────────────────────────
  audienceMissingMonths: 'ناقصهم شهور في الكورس المختار',
  audienceMissingMonthsHint:
    'طلبة سنة الكورس وشعبته اللي ناقصهم شهر واحد على الأقل من الشهور المفتوحة: اللي ماشتركوش خالص، واللي أخدوا الأول ومأخدوش التاني، وهكذا. الترم والسنة بيغطّوا كل الشهور.',
  audienceMissingMonthsNeedsCourse: 'محتاج تختار الكورس الأول',
  audienceMissingMonthsCourses:
    'مع الاختيار ده، الكورسات معناها «طلبة الكورس ده» مش «اللي سجّلوا فيه» — أغلب اللي ناقصهم شهور عمرهم ما داسوا على الاشتراك.',

  // ── the second text ────────────────────────────────────────────────
  bodyPartialToggle: 'رسالة مختلفة للمشتركين في شهور وناقصهم شهور',
  bodyPartialLabel: 'رسالة المشتركين في شهور وناقصهم شهور',
  bodyPartialHint:
    'الرسالة اللي فوق بتروح للي ماعندهمش ولا شهر مفتوح (وللأرقام اللي من غير حساب). دي بتروح للي عندهم شهر أو أكتر وناقصهم غيرهم.',
  bodyMainForNone: 'الرسالة دي للي ماعندهمش ولا شهر من الشهور المفتوحة.',

  // ── the per-recipient tokens ───────────────────────────────────────
  tokensLead: 'بيتملوا لكل طالب لوحده:',
  tokenMonths: 'الشهور الناقصة بالكلام — «الشهر التاني والتالت»',
  tokenLink: 'صفحة الاشتراك في الكورس، على أول شهر ناقص، والكود مكتوب فيها',
  tokenCode: 'كود اليوم',
  tokenLastDay: 'آخر يوم الكود شغال فيه',
  linkAutomatic: 'في الحملة دي اللينك بيتعمل لوحده لكل طالب — خانة اللينك تفضل فاضية.',

  // ── «كود خصم لكل يوم» ──────────────────────────────────────────────
  couponTitle: 'كود خصم لكل يوم',
  couponLead:
    'كل يوم الحملة بتبعت فيه، بيتعمل كود جديد لوحده مع أول رسالة: البادئة + اليوم والشهر (مثلًا WELCOME0311). مرة واحدة لكل حساب، على الكورسات اللي هنا بس.',
  couponToggle: 'إضافة كود خصم يومي',
  couponPrefix: 'بادئة الكود',
  couponPrefixHint: 'حروف إنجليزي وأرقام. الكود = البادئة + اليوم والشهر.',
  couponValidDays: 'شغال كام يوم',
  couponValidDaysHint: 'من يوم ما الرسالة توصل، لحد آخر اليوم الأخير.',
  couponCourses: 'الكود على أنهي كورسات',
  couponPlanAmounts: 'الخصم على كل نوع اشتراك (جنيه)',
  couponPlanAmountsHint: 'فاضي = الكود مابيطبّقش على النوع ده.',
  couponSample: 'مثال: كود النهارده {code}، شغال لحد {date}',
  couponOff: 'الخصم مقفول على الستاك ده — كوبونات الخصم لازم تكون مفتوحة.',

  plan: {
    monthly: 'الشهر',
    quarterly: '٣ شهور',
    term: 'الترم',
    yearly: 'السنة',
  },

  // ── the preview ───────────────────────────────────────────────────
  previewNone: 'شكل الرسالة للي ماعندهمش ولا شهر',
  previewPartial: 'شكل الرسالة للي ناقصهم شهور',
  /** Sample values the preview fills the tokens with. */
  sampleName: 'محمد',
  sampleMonthsAll: [1, 2, 3],
  sampleMonthsPartial: [2, 3],

  // ── the campaign screen ────────────────────────────────────────────
  dayCouponsTitle: 'أكواد الحملة',
  dayCouponsEmpty: 'لسه مااتعملش كود — أول كود بيتعمل مع أول رسالة.',
  dayCouponUses: '{n} استخدام',
  dayCouponUntil: 'لحد {date}',

  // ── what the runner writes ────────────────────────────────────────
  /** Recipient skipped: every open month is held now. */
  skipNothingMissing: 'كل الشهور المفتوحة اتاخدت خلاص',
  /** Campaign paused: the stack's switches. */
  pauseFeatureOff:
    'اتوقفت لوحدها: الكود اليومي محتاج «كوبونات الخصم» و«كود خصم يومي في الحملات» مفتوحين على الستاك ده.',
  /** Campaign paused: the day's code is already a coupon made by hand or by another campaign. */
  pauseCodeTaken: 'اتوقفت لوحدها: الكود {code} موجود قبل كده كوبون تاني. الحل: تغيير بادئة الكود أو مسح الكوبون التاني، وبعدين «كمّل».',
  /** The coupon's own note on `/admin/coupons`. */
  couponNote: 'كود يوم {date} — حملة «{name}»',

  // ── /admin/coupons: «خصم لكل نوع اشتراك» ──────────────────────────
  kindPerPlan: 'لكل نوع اشتراك',
  perPlanLabel: 'خصم لكل نوع',
  fromCampaign: 'من حملة «{name}»',
} as const;
