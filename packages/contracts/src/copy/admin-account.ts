/**
 * The signed-in admin's own account: the header's account menu and the
 * «تغيير كلمة السر» section of `/admin/profile`.
 *
 * ## Why the password needed its own way in
 *
 * The change-password form shipped on 2026-10-15 at the bottom of a profile
 * page whose only door was an unlabelled person-and-cog icon in the header —
 * and the owner, looking for it, reported that it was not there. So the
 * header now has a labelled account menu whose second item is the password
 * itself, and it lands on the section with the first field focused
 * (`/admin/profile#password`).
 *
 * Its own module, not more keys on `copy.admin.profile`, for the reason every
 * new copy block here gets one: a key added to an existing module is
 * `undefined` in a tab that outlived the deploy.
 *
 * Egyptian and neutral, like the rest of the dashboard since #180 — the
 * strings this replaced were Modern Standard Arabic with masculine
 * imperatives in them («اكتب»، «أعد كتابة»).
 */
export const adminAccount = {
  menu: {
    /** The trigger's visible label from `xl`, and its accessible name always. */
    label: 'حسابي',
    profile: 'الملف الشخصي',
    changePassword: 'تغيير كلمة السر',
  },

  /** The overview's session count, as a counted noun. */
  sessions: { one: 'جلسة واحدة', two: 'جلستين', few: '{count} جلسات', many: '{count} جلسة' },
  /** `permissions: ['*']` — the owner, who holds everything. */
  allPermissions: 'كل الصلاحيات',
  permissionsCount: { one: 'صلاحية واحدة', two: 'صلاحيتين', few: '{count} صلاحيات', many: '{count} صلاحية' },
  /** A phone number the API refused to store — not an Egyptian mobile. */
  phoneInvalid: 'رقم الموبايل مش مظبوط — لازم يكون رقم مصري زي 01012345678.',
  phoneTaken: 'رقم الموبايل ده مستخدم في حساب تاني.',
  phoneHint: 'الرقم ده ممكن يتسجّل بيه الدخول.',
  emailLocked: 'البريد هو اللي بيتعرف بيه الحساب، ومبيتغيّرش من هنا.',
  emailMissing: 'مفيش بريد على الحساب',
  nameTooShort: 'الاسم لازم يكون حرفين على الأقل.',
  nameRequiredHint: 'الاسم كامل',
  saveFailed: 'مقدرناش نحفظ البيانات — نجرّب تاني.',

  password: {
    title: 'تغيير كلمة السر',
    lead: 'كلمة السر الحالية الأول، وبعدها الجديدة مرتين.',
    current: 'كلمة السر الحالية',
    next: 'كلمة السر الجديدة',
    confirm: 'تأكيد كلمة السر الجديدة',
    nextHint: '8 حروف على الأقل.',
    show: 'إظهار كلمة السر',
    hide: 'إخفاء كلمة السر',
    revoke: 'تسجيل خروج من باقي الأجهزة',
    /** The checkbox is OFF by default, and the sentence says why someone
     *  would turn it on — and that this device is never the one that leaves. */
    revokeHint: 'الجهاز ده هيفضل داخل. الأجهزة التانية بس هي اللي هتخرج — مفيد لو كلمة السر القديمة كانت متعرفة لحد.',
    submit: 'تغيير كلمة السر',
    submitting: 'بنغيّر…',
    done: 'اتغيّرت كلمة السر. الجهاز ده لسه داخل.',
    doneRevoked: 'اتغيّرت كلمة السر، وباقي الأجهزة خرجت. الجهاز ده لسه داخل.',

    /* The refusals, each one a sentence about what to fix. The API answers
       with a CODE (`AdminProfileService`) and the screen picks the words —
       the raw `BadRequestException` message used to be printed as-is. */
    errors: {
      currentRequired: 'كلمة السر الحالية لسه فاضية.',
      tooShort: 'كلمة السر الجديدة لازم تكون 8 حروف على الأقل.',
      tooLong: 'كلمة السر الجديدة طويلة أوي — أقصى حاجة 128 حرف.',
      mismatch: 'التأكيد مش زي كلمة السر الجديدة.',
      sameAsCurrent: 'كلمة السر الجديدة لازم تكون غير الحالية.',
      wrongCurrent: 'كلمة السر الحالية مش مظبوطة.',
      noCredential: 'الحساب ده بيدخل من غير كلمة سر (بجوجل مثلًا)، فمفيش كلمة سر تتغيّر هنا.',
      failed: 'مقدرناش نغيّر كلمة السر — نجرّب تاني.',
    },
  },
} as const;

export type AdminAccountCopy = typeof adminAccount;
