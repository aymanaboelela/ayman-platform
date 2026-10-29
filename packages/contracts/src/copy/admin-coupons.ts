/**
 * «كوبونات الخصم» — the admin's screen.
 *
 * Staff copy, Egyptian Arabic, same rules as the rest of the admin tables
 * (CLAUDE.md §7): masdar buttons, and nothing that describes a student
 * genders them. No instructor name — the copy table is shared and the
 * tenant-identity guard walks it.
 */
export const adminCouponsCopy = {
  title: 'كوبونات الخصم',
  lead: 'كود يكتبه الطالب وهو بيدفع الاشتراك، فياخد خصم بنسبة أو بمبلغ. المبلغ اللي بيتطلب والإيراد بيتحسبوا بعد الخصم.',

  statTotal: 'كل الكوبونات',
  statActive: 'شغالة دلوقتي',
  statExpired: 'مدتها خلصت',
  statUses: 'مرات الاستخدام',
  statGiven: 'إجمالي الخصم',
  currency: 'جنيه',

  createTitle: 'كوبون جديد',
  code: 'الكود',
  codeHint: 'حروف إنجليزي وأرقام، من ٣ لـ ٣٢. الكبير والصغير واحد.',
  kind: 'نوع الخصم',
  kindPercent: 'نسبة',
  kindFixed: 'مبلغ ثابت',
  percentOff: 'النسبة (٪)',
  amountOff: 'المبلغ (جنيه)',
  scope: 'على أنهي كورسات',
  scopeAll: 'كل الكورسات',
  scopeSome: 'كورسات معيّنة',
  scopeDraft: 'مسودة',
  startsAt: 'يبدأ من',
  endsAt: 'ينتهي في',
  windowHint: 'فاضي = من غير ميعاد.',
  maxUses: 'أقصى عدد استخدامات',
  maxUsesHint: 'لكل الطلبة مع بعض. فاضي = مفتوح.',
  maxPerStudent: 'أقصى استخدام للطالب الواحد',
  maxPerStudentHint: 'فاضي = مفتوح.',
  active: 'شغال',
  note: 'ملاحظة (للأدمن بس)',
  create: 'إنشاء الكوبون',
  creating: 'بيتعمل…',
  created: 'الكوبون اتعمل',

  listTitle: 'الكوبونات',
  searchPlaceholder: 'بحث بالكود',
  filterAll: 'الكل',
  status: {
    active: 'شغال',
    inactive: 'متوقف',
    scheduled: 'لسه مابدأش',
    expired: 'مدته خلصت',
    exhausted: 'خلص',
  },
  empty: 'مفيش كوبونات هنا لسه.',
  percentLabel: 'خصم {percent}٪',
  fixedLabel: 'خصم {amount} جنيه',
  allCourses: 'كل الكورسات',
  uses: '{used} من {max}',
  usesUnlimited: '{used} — مفتوح',
  perStudent: '{max} للطالب',
  given: 'خصم {amount} جنيه',
  from: 'من {date}',
  until: 'لحد {date}',
  noWindow: 'من غير ميعاد',
  createdBy: 'من إنشاء {name}',

  pause: 'إيقاف',
  resume: 'تشغيل',
  edit: 'تعديل',
  remove: 'حذف',
  removeConfirm: 'حذف الكوبون ده؟ مفيش حد استخدمه، فالحذف مالوش أثر على أي دفعة.',
  removed: 'الكوبون اتحذف',
  saved: 'اتحفظ',
  save: 'حفظ',
  cancel: 'إلغاء',
  editTitle: 'تعديل الكوبون',
  editHint: 'الكود والخصم والكورسات ثابتين بعد الإنشاء — لو فيهم غلط، كوبون جديد ووقّف القديم.',

  redemptions: 'الاستخدامات',
  redemptionsTitle: 'استخدامات {code}',
  redemptionsEmpty: 'لسه محدش استخدم الكود ده.',
  redemptionWallet: 'من المحفظة',
  redemptionReleased: 'الطلب اترفض والاستخدام رجع',
  redemptionStatus: {
    pending: 'في المراجعة',
    approved: 'اتوافق عليه',
    rejected: 'اترفض',
  },
  loading: 'بيحمّل…',

  prev: 'السابق',
  next: 'التالي',
  pageOf: 'صفحة {page} من {pages}',

  errors: {
    invalid: 'فيه حاجة مش مظبوطة في البيانات.',
    codeTaken: 'الكود ده موجود قبل كده.',
    maxBelowUses: 'العدد الأقصى أقل من اللي اتستخدم فعلًا.',
    hasRedemptions: 'الكوبون ده اتستخدم — الإيقاف بدل الحذف.',
    failed: 'حصل خطأ، نجرّب تاني.',
  },

  /** On the payments review row — why the amount is lower than the plan.
   *  The code goes between the two, in its own LTR run. */
  paymentCoupon: 'كوبون',
  paymentCouponOff: 'خصم {amount} جنيه',
} as const;
