/**
 * «سؤال اليوم», «خطة المذاكرة», «ملاحظاتي», «أوسمتي», «ملخص الشهر» — every
 * word on those screens, in one module.
 *
 * Its own module, not keys in `copy/ar.ts`, for the reason `copy/backlog.ts`
 * gives: a tab left open from an earlier build has no module id for a new path
 * (`turbopack-module-ids-outlive-a-deploy`). The only keys in `ar.ts` are the
 * rail labels (`nav.*`).
 *
 * ⚠️ Never the masculine. Buttons are nouns («الإجابة»، «حفظ الخطة»), states
 * are passive («اتحل»، «اتسجلت»), and the plan speaks in the first person
 * plural («نعمل الخطة»). `engagement-voice.spec.ts` walks every line.
 *
 * `{count}`-style forms are `arabicCount` tables: one / two / few / many.
 */
export const engagementCopy = {
  daily: {
    meta: { title: 'سؤال اليوم' },
    page: {
      eyebrow: 'كل يوم سؤال',
      title: 'سؤال اليوم',
      lead: 'سؤال واحد كل يوم من المحاضرات اللي اتشافت. الإجابة مرة واحدة بس، وكل يوم فيه إجابة بيكبّر السلسلة.',
    },
    streak: {
      pill: 'السلسلة',
      days: { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوم' },
      runLabel: 'ورا بعض',
      zero: 'السلسلة بتبدأ من أول إجابة',
      best: 'أطول سلسلة',
      answered: 'إجابات',
      right: 'صح',
      rate: 'نسبة الصح',
      weekLabel: 'آخر ٧ أيام',
      status: { right: 'صح', wrong: 'غلط', missed: 'فات', today: 'النهارده' },
    },
    card: {
      eyebrow: 'سؤال النهارده',
      from: 'من {course}',
      confirm: 'تأكيد الإجابة',
      sending: 'بنسجّل الإجابة…',
      pickFirst: 'اختيار إجابة الأول',
      oneShot: 'الإجابة مرة واحدة — مفيش تغيير بعد التأكيد.',
    },
    result: {
      rightTitle: 'إجابة صح',
      wrongTitle: 'الإجابة مش مظبوطة',
      streakNow: 'السلسلة بقت {n}',
      keyHint: 'الإجابة الصح متعلّمة بالأخضر.',
      explanation: 'الشرح',
      review: 'مراجعة المحاضرة',
      next: 'سؤال جديد بعد نص الليل.',
    },
    empty: {
      title: 'لسه مفيش سؤال',
      body: 'أول ما محاضرة فيها أسئلة تتفتح في الكورسات، سؤال اليوم هيبدأ يظهر هنا.',
      cta: 'الكورسات',
    },
    errors: {
      already: 'الإجابة اتسجلت قبل كده.',
      failed: 'حصلت مشكلة والإجابة ماتسجلتش.',
      retry: 'محاولة تانية',
    },
  },

  plan: {
    meta: { title: 'خطة المذاكرة' },
    page: {
      eyebrow: 'لحد الامتحان',
      title: 'خطة المذاكرة',
      lead: 'ميعاد الامتحان وأيام الراحة، والمنصة بتوزّع المتراكم على الأيام الباقية لوحدها — وكل ما حاجة تخلص الخطة بتتظبط.',
    },
    setup: {
      title: 'نعمل الخطة',
      body: 'ميعاد الامتحان بس هو المطلوب. أيام الراحة اختيارية، والأسبوع الأخير قبل الامتحان بيبقى للمراجعة.',
      examDate: 'ميعاد الامتحان',
      daysOff: 'أيام الراحة',
      daysOffHint: 'أيام في الأسبوع من غير محاضرات جديدة.',
      save: 'حفظ الخطة',
      saving: 'بنحفظ…',
      cancel: 'إلغاء',
      badDate: 'الميعاد لازم يكون النهارده أو بعده، وفي خلال سنة.',
      failed: 'الخطة ماتحفظتش. محاولة تانية؟',
    },
    hero: {
      pill: 'العد التنازلي',
      left: 'فاضل',
      days: { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوم' },
      examOn: 'الامتحان {date}',
      examToday: 'الامتحان النهارده — بالتوفيق',
    },
    status: {
      onTrack: 'الخطة ماشية: {n} في اليوم',
      tight: 'الوقت ضيق: {n} في اليوم. أيام راحة أقل بتخفّف الحمل.',
      clear: 'مفيش متراكم — الأيام الجاية كلها مراجعة.',
      past: 'ميعاد الامتحان عدّى. ميعاد جديد؟',
    },
    today: {
      title: 'النهارده',
      done: { one: 'حاجة اتعملت النهارده', two: 'حاجتين اتعملوا النهارده', few: '{count} حاجات اتعملت النهارده', many: '{count} حاجة اتعملت النهارده' },
      quotaDone: 'حصة النهارده تمّت — اللي جاي مستني بكرة.',
    },
    week: 'الأيام الجاية',
    kind: {
      off: 'راحة',
      revision: 'مراجعة',
      exam: 'يوم الامتحان',
      empty: 'مفيش حاجة',
    },
    remaining: { one: 'حاجة متبقية', two: 'حاجتين متبقيين', few: '{count} حاجات متبقية', many: '{count} حاجة متبقية' },
    revisionFrom: 'المراجعة من {date}',
    edit: 'تعديل الخطة',
    remove: 'مسح الخطة',
    removeConfirm: 'الخطة هتتمسح، والمتراكم زي ما هو.',
    /** Sunday first, matching `weekdayOf`. */
    weekdays: ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'],
  },

  notes: {
    meta: { title: 'ملاحظاتي' },
    page: {
      eyebrow: 'المذاكرة',
      title: 'ملاحظاتي',
      lead: 'كل الملاحظات اللي اتكتبت على المحاضرات، ومع كل واحدة الدقيقة بتاعتها في الفيديو.',
      count: { one: 'ملاحظة واحدة', two: 'ملاحظتين', few: '{count} ملاحظات', many: '{count} ملاحظة' },
      search: 'بحث في الملاحظات',
      noMatch: 'مفيش ملاحظة فيها الكلام ده.',
    },
    empty: {
      title: 'لسه مفيش ملاحظات',
      body: 'تحت فيديو أي محاضرة فيه مكان للملاحظات — والملاحظة بتتعلّم على الدقيقة اللي اتكتبت عندها.',
      cta: 'الكورسات',
    },
    panel: {
      title: 'ملاحظاتي',
      placeholder: 'ملاحظة على المحاضرة دي…',
      /** The minute itself is printed beside this, in its own LTR span. */
      pin: 'على الدقيقة',
      all: 'كل الملاحظات',
      add: 'إضافة',
      adding: 'بنضيف…',
      edit: 'تعديل',
      save: 'حفظ',
      cancel: 'إلغاء',
      remove: 'مسح',
      removeConfirm: 'الملاحظة دي هتتمسح.',
      jump: 'تشغيل من {time}',
      general: 'على المحاضرة كلها',
      empty: 'أي حاجة مهمة في الشرح تتكتب هنا، وتتعلّم على دقيقتها في الفيديو.',
      limit: 'المحاضرة دي وصلت لأقصى عدد ملاحظات.',
      failed: 'الملاحظة ماتحفظتش. محاولة تانية؟',
    },
    openLesson: 'المحاضرة',
  },

  badges: {
    meta: { title: 'أوسمتي' },
    page: {
      eyebrow: 'الإنجازات',
      title: 'أوسمتي',
      lead: 'كل وسام له تلات درجات: برونز وفضة ودهب. الأرقام بتتحسب لوحدها من الشغل على المنصة.',
    },
    hero: {
      pill: 'الأوسمة',
      /** Under the big number, which is drawn apart. */
      of: 'من {total}',
      label: 'درجة وسام',
      recent: 'آخر الأوسمة',
      none: 'أول وسام قريب — أول ٥ محاضرات بيجيبوا برونز المحاضرات.',
    },
    tier: { bronze: 'برونز', silver: 'فضة', gold: 'دهب' },
    progress: '{value} من {target}',
    next: 'الجاي: {tier} عند {target}',
    complete: 'الدهب اتاخد',
    earnedOn: 'اتاخد {date}',
    newBadge: 'جديد',
    family: {
      lessons: { name: 'المحاضرات', unit: 'محاضرات اتشافت للآخر' },
      quizzes: { name: 'الكويزات', unit: 'كويزات اتنجح فيها' },
      fullMarks: { name: 'الدرجة النهائية', unit: 'كويزات بالدرجة النهائية' },
      streak: { name: 'السلسلة', unit: 'أيام ورا بعض في سؤال اليوم' },
      daily: { name: 'سؤال اليوم', unit: 'أسئلة يوم اتجاوبت' },
      homework: { name: 'الواجبات', unit: 'واجبات اتسلّمت' },
      mistakes: { name: 'دفتر الغلطات', unit: 'غلطات اتصلحت' },
      notes: { name: 'الملاحظات', unit: 'ملاحظات اتكتبت' },
      arena: { name: 'ساحة التحدي', unit: 'ماتشات اتكسبت' },
      courses: { name: 'الكورسات', unit: 'كورسات اكتملت' },
    },
  },

  recap: {
    meta: { title: 'ملخص الشهر' },
    page: {
      eyebrow: 'الشهر بالأرقام',
      title: 'ملخص الشهر',
      lead: 'المذاكرة والدرجات والأيام في شهر واحد — وصورة ستوري جاهزة للمشاركة.',
    },
    month: 'الشهر',
    partial: 'لحد النهارده',
    heroLabel: 'وقت مذاكرة',
    hoursMinutes: '{h} س {m} د',
    /** Under an hour — an `arabicCount` table: «دقيقة»، «دقيقتين»، «٣ دقايق». */
    minutesOnly: { one: 'دقيقة', two: 'دقيقتين', few: '{count} دقايق', many: '{count} دقيقة' },
    tiles: {
      lessons: 'محاضرات اكتملت',
      quizzes: 'كويزات اتحلّت',
      average: 'متوسط الدرجات',
      best: 'أعلى درجة',
      activeDays: 'أيام مذاكرة',
      activeOf: 'من {total} يوم',
      daily: 'سؤال اليوم',
      dailyOf: '{right} صح من {answered}',
      notes: 'ملاحظات',
      badges: 'درجات أوسمة جديدة',
      topCourse: 'أكتر كورس',
      peakHour: 'أكتر وقت مذاكرة',
    },
    /** The hour, said the way it is said: «الساعة ١٠ بالليل». */
    hour: {
      at: 'الساعة {h}',
      morning: 'الصبح',
      noon: 'الضهر',
      afternoon: 'العصر',
      evening: 'بالليل',
      lateNight: 'بعد نص الليل',
    },
    empty: {
      title: 'الشهر ده لسه فاضي',
      body: 'أول محاضرة تتشاف، الأرقام تبدأ تتعد هنا.',
      cta: 'الكورسات',
    },
    share: {
      button: 'صورة للستوري',
      title: 'ملخص الشهر',
      preparing: 'بنجهّز الصورة…',
      download: 'تحميل الصورة',
      send: 'مشاركة',
      close: 'قفل',
      failed: 'الصورة ماتعملتش. محاولة تانية؟',
      /** Printed on the image itself. */
      story: {
        heading: 'ملخص شهر {month}',
        watch: 'وقت مذاكرة',
        lessons: 'محاضرة',
        quizzes: 'كويز',
        days: 'يوم مذاكرة',
        best: 'أعلى درجة',
        streak: 'سؤال اليوم',
        footer: 'على منصة {teacher}',
        qrHint: 'الكود ده بيودّي على المنصة',
      },
    },
  },

  dashboard: {
    title: 'النهارده',
    daily: {
      title: 'سؤال اليوم',
      pending: 'سؤال النهارده مستني',
      done: 'سؤال النهارده اتحل',
      streak: { one: 'يوم ورا بعض', two: 'يومين ورا بعض', few: '{count} أيام ورا بعض', many: '{count} يوم ورا بعض' },
      noStreak: 'السلسلة بتبدأ النهارده',
      cta: 'الإجابة',
      ctaDone: 'السلسلة',
    },
    plan: {
      title: 'خطة المذاكرة',
      left: { one: 'فاضل يوم على الامتحان', two: 'فاضل يومين على الامتحان', few: 'فاضل {count} أيام على الامتحان', many: 'فاضل {count} يوم على الامتحان' },
      today: { one: 'حاجة واحدة النهارده', two: 'حاجتين النهارده', few: '{count} حاجات النهارده', many: '{count} حاجة النهارده' },
      quotaDone: 'حصة النهارده تمّت',
      none: 'ميعاد الامتحان، والمنصة تقسّم المتراكم على الأيام.',
      cta: 'الخطة',
      ctaNone: 'نعمل خطة',
    },
    recap: {
      title: 'ملخص شهر {month}',
      body: 'الشهر بالأرقام، وصورة للستوري.',
      cta: 'الملخص',
    },
    badges: {
      title: 'أوسمتي',
      line: 'برونز وفضة ودهب على الشغل كله',
      cta: 'كل الأوسمة',
    },
  },
} as const;
