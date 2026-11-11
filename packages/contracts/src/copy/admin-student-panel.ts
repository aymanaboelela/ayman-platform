/**
 * «ملف الطالب» جوّه الشات — the drawer the ⋮ in a conversation's header
 * opens: everything about the student he is talking to, without leaving the
 * thread. «يبقى في كل حاجة عن الطالب… امتحاناته، درجاته، أقفله كورس،
 * أفتحله شهر».
 *
 * Its own module rather than more keys on `copy.assistant.inbox` or
 * `copy.admin.students`: a key added to an existing module is `undefined` in
 * a tab that outlived the deploy (Turbopack keeps the old factory for the old
 * path — see `copy/admin-grading.ts`), and the inbox is a screen he leaves
 * open all evening.
 *
 * Voice: the admin rule since #180 — masdar on buttons, a question in the
 * first person plural, and nothing that genders the student it describes
 * (`compose.spec.ts` holds the word list).
 */
export const adminStudentPanel = {
  /** The ⋮ button's accessible name and tooltip. */
  open: 'كل حاجة عن الطالب',
  /** The drawer's title, for screen readers — the hero shows the name. */
  title: 'ملف الطالب',
  close: 'قفل',
  tabs: {
    overview: 'الملف',
    courses: 'الكورسات',
    exams: 'الامتحانات',
    homework: 'الواجبات',
    money: 'الفلوس',
    account: 'الحساب',
    activity: 'النشاط',
    analysis: 'التحليل',
  },
  fullProfile: 'الصفحة الكاملة',
  whatsapp: 'واتساب',
  /** When the record can't be read at all — a deleted account, a 404. */
  unavailable: 'الحساب ده مش متاح دلوقتي.',

  hero: {
    /** `{n}` — the short number the centre's barcode carries. */
    studentNumber: 'ID {n}',
    banned: 'محظور',
    noYear: 'الصف مش متسجّل',
  },

  overview: {
    statsTitle: 'المستوى باختصار',
    lessonsCompleted: 'دروس خلصت',
    /** `{n}` of `{total}` opened. */
    lessonsOf: 'من {n} اتفتحت',
    watchHours: 'ساعات مشاهدة',
    meanScore: 'متوسط الدرجات',
    /** `{n}` — the cohort's mean, beside the student's own. */
    cohort: 'الدفعة {n}',
    passRate: 'نسبة النجاح',
    lastActive: 'آخر نشاط',
    neverActive: 'لسه',
    statsUnavailable: 'التحليل مش متاح للحساب ده.',

    infoTitle: 'البيانات',
    governorate: 'المحافظة',
    school: 'المدرسة',
    stream: 'الشعبة',
    studyType: 'نوع الدراسة',
    attendance: 'الحضور',
    fatherPhone: 'موبايل ولي الأمر',
    email: 'الإيميل',
    notRecorded: 'مش متسجّل',

    shortcutsTitle: 'اختصارات',
    shortcutCourses: 'فتح شهر أو ترم، تفعيل كورس أو قفله',
    shortcutExams: 'كل امتحان ودرجته، ومحاولة جديدة بضغطة',
    shortcutAnalysis: 'المذاكرة والمشاهدة والدرجات بالتفصيل',
  },

  courses: {
    lead: 'نفس أدوات صفحة الطالب بالظبط: أي شهر أو ترم أو كورس يتفتح أو يتقفل من هنا، والشات مفتوح وراك.',
  },

  exams: {
    sat: 'امتحانات اتدخلت',
    average: 'متوسط آخر محاولة',
    passed: 'نجاح',
    pending: 'مستنية تصحيح',
    empty: 'مفيش ولا امتحان اتدخل لسه.',
    emptyHint: 'أول ما يتدخل امتحان هيظهر هنا بدرجته.',
    /** Sittings of the same exam, through `arabicCount` — «٣ محاولة» is
     *  the mistake a bare `{n}` template makes. */
    attempts: {
      one: 'محاولة واحدة',
      two: 'محاولتين',
      few: '{count} محاولات',
      many: '{count} محاولة',
    },
    /** One sitting on the history strip: `{n}` its number, `{mark}` its mark. */
    attemptMark: 'م{n}: {mark}',
    /** `{at}` — when the latest sitting started. */
    latestAt: 'آخر محاولة {at}',
    extraAttempt: 'محاولة جديدة',
    extraAttemptConfirm: 'نفتح محاولة زيادة في الامتحان ده؟',
    extraAttemptDone: 'اتفتحت محاولة جديدة',
    failed: 'مامشيش، جرّب تاني',
    moreActions: 'وقت زيادة أو فتح تاني',
    /** `{n}` — the newest sittings this list holds. */
    capped: 'دي أحدث {n} محاولة بس.',
    allAttempts: 'كل المحاولات',

    /* ── تعديل الدرجة ──────────────────────────────────────────────────── */
    editScore: 'تعديل الدرجة',
    /** `{outOf}` — the sitting's own scale. */
    scoreLabel: 'الدرجة من {outOf}',
    /** The attempt picker, when there is more than one handed-in sitting. */
    whichAttempt: 'المحاولة',
    /** `{n}` the attempt number, `{mark}` its current mark. */
    attemptOption: 'محاولة {n} ({mark})',
    save: 'حفظ',
    saving: 'بنحفظ…',
    scoreSaved: 'الدرجة اتعدّلت',
    /** `{outOf}` */
    scoreTooHigh: 'الدرجة لازم تكون بين ٠ و{outOf}',
    gradePaper: 'تصحيح سؤال سؤال',
  },

  homework: {
    sat: 'واجبات اتسلّمت',
    accepted: 'اتقبلت',
    needsWork: 'محتاجة تتعاد',
    pending: 'مستنية مراجعة',
    empty: 'مفيش ولا واجب اتسلّم لسه.',
    emptyHint: 'أول ما يتسلّم واجب هيظهر هنا، وتقدر تقبله أو تعدّل درجته من مكانك.',
    status: {
      submitted: 'مستني مراجعة',
      accepted: 'مقبول',
      needs_work: 'يتعاد',
    },
    /** `{n}` — a resubmission after «يتعاد». */
    attempt: 'تسليم {n}',
    /** `{grade}` out of 100 — every واجب is marked on 100. */
    gradeOf: '{grade}/100',
    noGrade: 'من غير درجة',
    open: 'افتح الواجب',
    edit: 'المراجعة والدرجة',
    decisionAccepted: 'مقبول',
    decisionNeedsWork: 'يتعاد',
    gradeLabel: 'الدرجة من 100',
    gradeHint: 'سيبها فاضية لو مفيش درجة.',
    messageLabel: 'الرسالة اللي هتوصل في المحادثة',
    /**
     * The defaults the message box starts with — the review endpoint ALWAYS
     * writes its message into the student's thread, so the box is never
     * empty. Student-facing, so no imperative and nothing gendered: «ابعته
     * تاني» genders the reader, «محتاج يتبعت تاني» does not.
     */
    defaultGraded: 'درجة واجب «{lesson}»: {grade} من 100.',
    defaultAccepted: 'واجب «{lesson}» اتقبل.',
    defaultNeedsWork: 'واجب «{lesson}» محتاج يتبعت تاني بعد المراجعة.',
    /** Accepting deletes the photographs — said before it happens. */
    acceptWarning: 'القبول بيمسح صور الحل.',
    saved: 'اتحفظ ووصل في المحادثة',
    failed: 'مامشيش، جرّب تاني',
    /** `{n}` — the newest submissions this list holds. */
    capped: 'دي أحدث {n} تسليم بس.',
  },

  analysis: {
    lead: 'نفس التحليل اللي في صفحة الطالب: المذاكرة والدرجات جنب متوسط الدفعة.',
  },
} as const;
