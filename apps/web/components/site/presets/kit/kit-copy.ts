/**
 * The words the three kit presets (`ruqaa`, `kurrasa`, `taif`) write
 * themselves, beside whatever the tenant composed in `/admin/home`.
 *
 * One table for all three: they are three looks over one set of sections, and
 * a heading that read «ابدأ من صفّك» on one and «اختار صفك» on another would be
 * the same page disagreeing with itself across a settings toggle.
 *
 * Nothing here addresses the student as a boy (`outreach/compose.spec.ts`'s
 * list) and nothing names a teacher — the name comes from `tenantName()`.
 */
export const kitCopy = {
  grades: {
    chip: 'الصفوف',
    title: 'كل صف ليه مكانه',
    lead: 'الكورسات مترتّبة بالصف، والدخول على صفك من هنا على طول.',
    tileCta: 'كورسات الصف',
  },

  courses: {
    chip: 'الكورسات',
    emptyTitle: 'أول كورس قرّب ينزل',
    emptyBody:
      'المحاضرات بتتسجّل دلوقتي، والحساب اللي يتعمل النهارده هيلاقي كل كورس جديد أول ما ينزل.',
    emptyCta: 'إنشاء حساب',
    priceFrom: 'يبدأ من',
  },

  instructor: {
    chip: 'المدرّس',
    title: 'مين بيشرح',
    starting: 'المنصة لسه في أولها — المحتوى بيتبني درس ورا درس، وكل حاجة بتنزل بتظهر هنا.',
    coursesUnit: 'كورس',
    lessonsUnit: 'محاضرة',
    hoursUnit: 'ساعة شرح',
  },

  honors: { chip: 'لوحة الشرف' },
  about: { chip: 'عن المنصة' },
  features: { chip: 'ليه هنا' },
  quotes: { chip: 'آراء الطلبة' },
  stats: { chip: 'بالأرقام' },
  faq: { chip: 'أسئلة' },

  books: {
    chip: 'الكتب',
    buy: 'اطلب الكتاب',
  },
} as const;
