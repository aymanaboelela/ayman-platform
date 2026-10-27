/**
 * صفحة ولي الأمر — كل كلمة على الشاشة، في مكان واحد.
 *
 * موديول لوحده، مش مفاتيح جديدة في `copy/ar.ts` — نفس سبب `copy/backlog.ts`:
 * تاب فاضل مفتوح من بيلد قبل كده ماعندوش module id للمسار ده
 * (`turbopack-module-ids-outlive-a-deploy`).
 *
 * ## النبرة
 *
 * الكلام لولي الأمر **عن** الطالب، والطالب ممكن يكون ولد أو بنت — والمنصة
 * مابتسألش. فمفيش فعل واحد هنا راجع على الطالب: «عدّى»، «امتحن»، «سلّم»،
 * «مشترك»، «ابنك» كلهم بيقولوا للأم إن الصفحة مكتوبة لطالب تاني لو عندها
 * بنت. الأدوات اللي شايلة الصفحة:
 *
 *   · الاسم — «سارة»، مش «ابنك/بنتك»؛
 *   · المبني للمجهول على الحاجة نفسها — «المحاضرة اتشافت»، «الواجب اتسلّم»؛
 *   · الجملة الاسمية — «فوق درجة النجاح» مش «نجح»، «حضور» و«غياب» مش «حضر».
 *
 * والأب كمان ممكن تكون أم: مفيش أمر لولي الأمر ولا ضمير مخاطب بيتصرّف.
 * التريبواير في `guardian-voice.spec.ts`.
 */
export const guardianCopy = {
  meta: { title: 'متابعة الطالب' },

  hero: {
    eyebrow: 'متابعة ولي الأمر',
    /** «آخر نشاط النهارده» / «آخر نشاط من ٣ أيام». */
    lastActive: 'آخر نشاط {when}',
    neverActive: 'لسه مفيش نشاط على المنصة',
    /** The friendly sentence under the name — «الأسبوع ده ٣ من ٤ محاضرات اتشافت». */
    week: 'الأسبوع ده {done} من {open} محاضرات اتشافت',
    weekAllDone: {
      one: 'الأسبوع ده المحاضرة المفتوحة اتشافت',
      two: 'الأسبوع ده المحاضرتين المفتوحين اتشافوا',
      few: 'الأسبوع ده كل المحاضرات المفتوحة اتشافت — {count} محاضرات',
      many: 'الأسبوع ده كل المحاضرات المفتوحة اتشافت — {count} محاضرة',
    },
    weekNoneYet: 'الأسبوع ده لسه مفيش محاضرة اتشافت من {open} مفتوحين',
    weekNothingOpen: 'مفيش محاضرات مستنية دلوقتي — كل اللي نزل اتشاف',
    weekNoCourses: 'أول ما يتم الاشتراك في كورس، المتابعة هتبدأ من هنا',
    quizzesThisWeek: {
      one: 'امتحان واحد اتحل',
      two: 'امتحانين اتحلّوا',
      few: '{count} امتحانات اتحلّت',
      many: '{count} امتحان اتحل',
    },
    homeworkThisWeek: {
      one: 'واجب واحد اتسلّم',
      two: 'واجبين اتسلّموا',
      few: '{count} واجبات اتسلّمت',
      many: '{count} واجب اتسلّم',
    },
  },

  /** «النهارده» / «امبارح» / «من ٣ أيام» / «يوم ١٢ أكتوبر». */
  when: {
    today: 'النهارده',
    yesterday: 'امبارح',
    days: 'من {count} أيام',
    date: 'يوم {date}',
  },

  stats: {
    lectures: 'محاضرات اتشافت',
    lecturesNote: 'في {count} كورس',
    quizzes: 'متوسط الكويزات',
    quizzesNote: {
      one: 'من كويز واحد',
      two: 'من كويزين',
      few: 'من {count} كويزات',
      many: 'من {count} كويز',
    },
    exams: 'متوسط الامتحانات',
    examsNote: {
      one: 'من امتحان واحد',
      two: 'من امتحانين',
      few: 'من {count} امتحانات',
      many: 'من {count} امتحان',
    },
    homework: 'واجبات اتسلّمت',
    homeworkNote: '{count} اتقبل',
    /** Where an average would be, before the first marked paper. «٠٪» reads
     *  «جاب صفر» — a different sentence altogether in a house. */
    none: 'لسه مفيش',
  },

  attention: {
    title: 'محتاج متابعة',
    lead: 'الحاجات اللي محتاجة نظرة، الأهم الأول.',
    clearTitle: 'كله تمام',
    clearBody: 'مفيش حاجة متأخرة دلوقتي: المحاضرات المفتوحة اتشافت، والواجبات اتسلّمت.',
    ended: 'اشتراك «{course}» خلص',
    endedBody: 'المحاضرات الجديدة مش هتفتح لحد ما الاشتراك يتجدد.',
    endingSoon: 'اشتراك «{course}» بيخلص {when}',
    homeworkMissing: {
      one: 'واجب واحد متسلّمش',
      two: 'واجبين متسلّموش',
      few: '{count} واجبات متسلّمتش',
      many: '{count} واجب متسلّمش',
    },
    homeworkRedo: {
      one: 'واجب واحد محتاج يتعاد',
      two: 'واجبين محتاجين يتعادوا',
      few: '{count} واجبات محتاجة تتعاد',
      many: '{count} واجب محتاج يتعاد',
    },
    lectures: {
      one: 'محاضرة واحدة لسه متشافتش',
      two: 'محاضرتين لسه متشافوش',
      few: '{count} محاضرات لسه متشافتش',
      many: '{count} محاضرة لسه متشافتش',
    },
    quizzes: {
      one: 'كويز واحد مفتوح ومتحلّش',
      two: 'كويزين مفتوحين ومتحلّوش',
      few: '{count} كويزات مفتوحة ومتحلّتش',
      many: '{count} كويز مفتوح ومتحلّش',
    },
    failed: {
      one: 'امتحان واحد درجته تحت النجاح',
      two: 'امتحانين درجتهم تحت النجاح',
      few: '{count} امتحانات درجتها تحت النجاح',
      many: '{count} امتحان درجته تحت النجاح',
    },
    inactive: 'مفيش أي نشاط من {count} يوم',
    /** «…و٣ كمان» after the first few titles. */
    more: 'و{count} كمان',
  },

  courses: {
    title: 'الكورسات',
    lecturesLabel: 'المحاضرات',
    access: {
      full: 'الاشتراك شغّال',
      term: 'اشتراك الترم شغّال',
      months: 'شغّال: {months}',
      until: 'لحد {date}',
      codes: 'محاضرات مفتوحة بكود',
      ended: 'الاشتراك خلص',
      closed: 'مقفول مؤقتًا للتعديل',
    },
    quizzes: 'الكويزات',
    exams: 'الامتحانات',
    noMark: '—',
    upToDate: 'مفيش حاجة متأخرة',
    /** «فاضل: محاضرتين · واجب» — what is left, said of the work, never of the student. */
    behind: 'فاضل',
    lecturesBehind: {
      one: 'محاضرة',
      two: 'محاضرتين',
      few: '{count} محاضرات',
      many: '{count} محاضرة',
    },
    quizzesBehind: {
      one: 'كويز',
      two: 'كويزين',
      few: '{count} كويزات',
      many: '{count} كويز',
    },
    homeworkBehind: {
      one: 'واجب',
      two: 'واجبين',
      few: '{count} واجبات',
      many: '{count} واجب',
    },
    lastActive: 'آخر نشاط {when}',
    noActivity: 'لسه مفيش نشاط',
    emptyTitle: 'لسه مفيش كورسات',
    emptyBody: 'أول ما يتم الاشتراك في كورس، التقدّم فيه هيظهر هنا محاضرة بمحاضرة.',
  },

  marks: {
    title: 'الدرجات',
    trendTitle: 'الدرجات مع الوقت',
    kind: { quiz: 'كويز', monthly: 'امتحان الشهر', final: 'الامتحان النهائي' },
    verdict: { passed: 'فوق درجة النجاح', failed: 'تحت درجة النجاح', pending: 'لسه بيتصحح' },
    score: '{score} من {outOf}',
    /** A paper with an essay still on the teacher's desk — the marked part out
     *  of what it is worth, and the rest named as still coming. */
    pending: '{score} من {outOf} في الجزء اللي اتصحّح، و{rest} درجة لسه بتتصحّح',
    sittings: {
      one: '',
      two: 'اتحل مرتين — والدرجة الأعلى بتتحسب',
      few: 'اتحل {count} مرات — والدرجة الأعلى بتتحسب',
      many: 'اتحل {count} مرة — والدرجة الأعلى بتتحسب',
    },
    passedCount: '{count} فوق النجاح',
    failedCount: '{count} تحت النجاح',
    pendingCount: '{count} لسه بيتصحح',
    showAll: 'كل الدرجات ({count})',
    emptyTitle: 'لسه مفيش امتحانات اتحلّت',
    emptyBody: 'أول ما يتحل كويز أو امتحان، الدرجة هتظهر هنا ومعاها الرسم.',
  },

  homework: {
    title: 'الواجبات',
    status: {
      accepted: 'اتقبل',
      submitted: 'مستني التصحيح',
      needs_work: 'محتاج يتعاد',
      missing: 'متسلّمش',
    },
    grade: 'الدرجة {grade}',
    handedIn: 'اتسلّم {when}',
    showAll: 'كل الواجبات ({count})',
    emptyTitle: 'لسه مفيش واجبات نزلت',
    emptyBody: 'كل محاضرة فيها واجب هتظهر هنا، وجنب كل واحدة حالة الواجب.',
  },

  achievements: {
    title: 'الإنجازات',
    rank: 'الترتيب في {cohort}',
    rankValue: '#{rank}',
    betterThan: 'أحسن من {percent}% من الدفعة',
    points: '{points} نقطة',
    honor: 'على لوحة الشرف',
    honorTimes: {
      one: 'تكريم واحد',
      two: 'تكريمين',
      few: '{count} تكريمات',
      many: '{count} تكريم',
    },
    certificates: 'الشهادات',
    certificatesNone: 'الشهادة بتتاخد بـ{percent}% أو أكتر — لسه مفيش واحدة.',
    unitCertificate: 'شهادة {title}',
    examCertificate: 'شهادة {title} — {percent}%',
    weakTitle: 'دروس محتاجة مراجعة',
    weakLead: 'أكتر دروس فيها أسئلة لسه إجابتها غلط في دفتر الغلطات.',
    weakCount: {
      one: 'سؤال واحد',
      two: 'سؤالين',
      few: '{count} أسئلة',
      many: '{count} سؤال',
    },
    weakNone: 'مفيش أسئلة غلط مستنية مراجعة.',
  },

  attendance: {
    title: 'الحضور في السنتر',
    present: 'حضور',
    absent: 'غياب',
    center: 'السنتر: {name}',
  },

  footer: 'الأرقام دي نفس اللي على حساب {name} بالظبط، وبتتحدّث أول بأول.',
} as const;
