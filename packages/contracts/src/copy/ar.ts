/**
 * The single Arabic string table. No component may contain a user-facing literal.
 * This is what makes adding English later a routing change rather than a rewrite.
 */
export const copy = {
  site: {
    name: 'أيمن أبو العيلة',
    tagline: 'البرمجة وعلوم الحاسب — نظام البكالوريا المصرية',
    instructor: 'المهندس أيمن أبو العيلة',
  },
  nav: {
    home: 'الرئيسية',
    courses: 'الكورسات',
    about: 'عن المنصة',
    contact: 'تواصل معنا',
    login: 'تسجيل الدخول',
    register: 'حساب جديد',
    dashboard: 'حسابي',
  },
  theme: {
    toggle: 'تبديل المظهر',
    light: 'فاتح',
    dark: 'داكن',
    system: 'حسب النظام',
  },
  onboarding: {
    governorate: 'المحافظة',
    governoratePlaceholder: 'اختر محافظتك',
    system: 'النظام الدراسي',
    year: 'الصف الدراسي',
    track: 'المسار',
    electiveSubject: 'المادة الاختيارية',
  },
  common: {
    loading: 'جارٍ التحميل',
    error: 'حصل خطأ',
    retry: 'حاول تاني',
    empty: 'مفيش حاجة هنا لسه',
  },
  home: {
    eyebrow: '01 / المنصة',
  },
} as const;

export type Copy = typeof copy;
