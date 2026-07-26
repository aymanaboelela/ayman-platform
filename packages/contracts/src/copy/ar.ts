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
  auth: {
    login: {
      title: 'تسجيل الدخول',
      subtitle: 'أهلًا بيك تاني، سجّل دخولك للمتابعة',
    },
    register: {
      title: 'إنشاء حساب جديد',
      subtitle: 'اعمل حسابك وابدأ رحلتك في البكالوريا المصرية',
    },
    fields: {
      name: 'الاسم الكامل',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      confirmPassword: 'تأكيد كلمة المرور',
    },
    actions: {
      login: 'تسجيل الدخول',
      loginPending: 'جارٍ تسجيل الدخول…',
      register: 'إنشاء حساب',
      registerPending: 'جارٍ إنشاء الحساب…',
    },
    switch: {
      noAccount: 'لسه معملتش حساب؟',
      createAccount: 'إنشاء حساب جديد',
      haveAccount: 'عندك حساب بالفعل؟',
      login: 'تسجيل الدخول',
    },
    providers: {
      divider: 'أو',
      google: 'المتابعة عبر جوجل',
      apple: 'المتابعة عبر أبل',
    },
    errors: {
      // One generic message per form, shown for EVERY failure reason on that
      // form (wrong password, unknown email, locked account, network error,
      // provider error). Never distinguish the cause in the UI — S1 requires
      // the login endpoint's responses to already be byte-identical across
      // failure modes, and a "helpful" UI message would quietly undo that by
      // reintroducing an enumeration signal one layer up.
      login: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      register: 'تعذر إنشاء الحساب. تأكد من البيانات وحاول تاني.',
    },
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
