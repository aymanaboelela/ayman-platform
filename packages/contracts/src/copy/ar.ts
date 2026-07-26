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
    title: 'أكمل بيانات حسابك',
    subtitle: 'محتاجين شوية معلومات بسيطة عشان نظبطلك المنصة على مقاسك',
    step1Title: 'من إنت',
    step2Title: 'مكانك',
    step3Title: 'دراستك',
    optionalTitle: 'بيانات إضافية',
    optionalSubtitle: 'اختيارية دلوقتي، وهنفكرك بيها تاني بعد كده',
    fullName: 'الاسم الكامل',
    fullNamePlaceholder: 'اكتب اسمك بالكامل',
    gender: 'النوع',
    genderPlaceholder: 'اختر النوع',
    genderMale: 'ذكر',
    genderFemale: 'أنثى',
    genderError: 'اختر النوع',
    phone: 'رقم الهاتف',
    phonePlaceholder: '01012345678',
    governorate: 'المحافظة',
    governoratePlaceholder: 'اختر محافظتك',
    schoolName: 'اسم المدرسة',
    schoolNamePlaceholder: 'اختياري',
    system: 'النظام الدراسي',
    systemPlaceholder: 'اختر النظام الدراسي',
    year: 'الصف الدراسي',
    yearPlaceholder: 'اختر الصف الدراسي',
    track: 'المسار',
    trackPlaceholder: 'اختر المسار',
    electiveSubject: 'المادة الاختيارية',
    electiveSubjectPlaceholder: 'اختر المادة الاختيارية',
    fatherPhone: 'رقم هاتف الأب',
    motherPhone: 'رقم هاتف الأم',
    parentPhonePlaceholder: 'اختياري',
    skip: 'تخطي دلوقتي',
    skipHint: 'هنسألك تاني بعدين',
    undoSkip: 'إظهار الحقول',
    submit: 'حفظ ومتابعة',
    submitPending: 'جارٍ الحفظ…',
    submitError: 'تعذر حفظ بياناتك. تأكد منها وحاول تاني.',
    phoneConflictError: 'رقم الهاتف ده مسجل بحساب تاني بالفعل',
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
  settings: {
    devices: {
      title: 'أجهزتي',
      subtitle: 'الأجهزة اللي سجلت دخولك منها. تقدر تلغي أي جهاز مش عارفه.',
      current: 'الجهاز الحالي',
      loggedInAt: 'دخلت من هنا في',
      lastSeenAt: 'آخر نشاط',
      revoke: 'إلغاء الجهاز',
      revokePending: 'جارٍ الإلغاء…',
      revokeCurrentConfirm: 'ده الجهاز اللي بتستخدمه دلوقتي. لو ألغيته هتتسجل خروجك فورًا. متأكد؟',
      revokeError: 'تعذر إلغاء الجهاز. حاول تاني.',
      empty: 'مفيش أجهزة مسجلة دخول دلوقتي',
    },
  },
  home: {
    eyebrow: '01 / المنصة',
  },
} as const;

export type Copy = typeof copy;
