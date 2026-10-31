/**
 * «المشتركين» — the admin screen of who holds a paid course or month and who
 * does not, and the ads file it hands out.
 *
 * Egyptian Arabic, admin-facing. No instructor name anywhere: the copy table
 * is shared by every stack and the tenant-identity guard walks it.
 */
export const subscribersCopy = {
  nav: 'المشتركين',
  title: 'المشتركين وغير المشتركين',
  eyebrow: 'الاشتراكات',
  lead: 'مين مشترك ومين لأ في كل كورس وكل شهر، من غير الكورس التأسيسي. دوس على أي رقم تشوف أساميهم وأرقامهم، ونزّل الملف جاهز للإعلانات.',

  totals: {
    students: 'كل الطلبة على المنصة',
    subscribed: 'مشتركين دلوقتي',
    notSubscribed: 'مش مشتركين',
    lapsed: 'كانوا مشتركين وخلص',
    withPhone: 'مش مشتركين ومعاهم رقم',
  },

  adsTitle: 'ملف الإعلانات',
  adsLead: 'ملف بالأرقام بالشكل اللي فيسبوك عاوزه. من مدير الإعلانات افتح «الجماهير» واعمل جمهور مخصص من «قايمة عملاء» وارفعه. الملف بينزل بنفس الفلاتر اللي تحت.',
  adsStudents: 'أرقام الطلبة',
  adsWithParents: 'الطلبة + أولياء الأمور',
  excel: 'تنزيل Excel',
  adsCount: '{n} رقم في الفلتر ده',

  coursesTitle: 'الكورسات والشهور',
  coursesLead: 'كل شهر: مين مشترك فيه، ومين مشتركش',
  coursesNone: 'مفيش كورسات مدفوعة لسه.',
  moreCourses: 'باقي الكورسات ({n})',
  yearLabel: { 1: 'أولى ثانوي', 2: 'تانية ثانوي', 3: 'تالتة ثانوي' } as Record<number, string>,
  courseSubscribed: 'مشترك',
  courseNotSubscribed: 'مش مشترك',
  courseLapsed: 'كان مشترك وخلص',
  courseAudienceHint: 'من {n} طالب في السنة دي',
  noMonths: 'الكورس ده مش مقسوم شهور.',
  monthClosed: 'مقفول للبيع',
  monthIn: 'مشترك',
  monthOut: 'مشتركش',
  monthDropped: '{n} اشتركوا قبل كده ومكمّلوش',
  monthBought: 'منهم {n} اشتروا الشهر ده',
  monthWide: '{n} معاهم الترم / الكورس كله',

  listTitle: 'الأسامي',
  statusOut: 'مش مشتركين',
  statusIn: 'مشتركين',
  audienceLabel: 'مين',
  audienceAll: 'كل اللي ممكن يشترك',
  audiencePast: 'اللي اشتركوا قبل كده بس',
  courseFilter: 'الكورس',
  courseAll: 'أي كورس مدفوع',
  monthFilter: 'الشهر',
  monthAll: 'الكورس كله',
  yearFilter: 'السنة',
  yearAll: 'كل السنين',
  phoneFilter: 'الرقم',
  phoneAny: 'الكل',
  phoneOnly: 'اللي معاهم رقم بس',
  search: 'دوّر باسم أو رقم',
  searchButton: 'دوّر',
  clear: 'امسح الفلاتر',

  count: '{n} طالب',
  empty: 'مفيش حد في الفلتر ده.',
  emptyHint: 'جرّب تغيّر الكورس أو الشهر أو «مين».',

  whatsapp: 'واتساب',
  profile: 'الملف',
  noProfile: 'ماكملش بياناته',
  noPhone: 'مفيش رقم',
  everBadge: 'اشترك قبل كده',
  neverBadge: 'عمره ما اشترك',
  wideChip: 'كامل',
  monthsChip: 'شهر {list}',
  yearUnknown: 'السنة مش متسجّلة',
  joined: 'عمل الحساب {date}',

  heading: {
    platformOut: 'مش مشتركين في أي كورس مدفوع',
    platformIn: 'مشتركين في كورس مدفوع على الأقل',
    platformLapsed: 'كانوا مشتركين واشتراكهم خلص',
    courseOut: 'مش مشتركين في {course}',
    courseIn: 'مشتركين في {course}',
    coursePast: 'اشتركوا في {course} قبل كده ومش مشتركين دلوقتي',
    monthOut: 'مشتركوش في {month} — {course}',
    monthIn: 'مشتركين في {month} — {course}',
    monthPast: 'اشتركوا قبل كده في {course} ومكمّلوش {month}',
  },
} as const;
