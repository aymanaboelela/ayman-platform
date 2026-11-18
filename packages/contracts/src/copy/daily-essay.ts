/**
 * «السؤال المقالي اليومي» — every word on the student's page, the home card
 * and the teacher's two screens, in one module.
 *
 * Its own module, not keys in `copy/ar.ts`, for the reason `copy/engagement.ts`
 * gives: a tab left open from an earlier build has no module id for a new
 * path. The only keys elsewhere are the two rail labels (`copy.nav.essay`,
 * `copy.admin.nav.essays`) and the notification's three lines.
 *
 * ⚠️ Never the masculine, on either side (CLAUDE.md §7). Buttons are nouns
 * («تسليم الحل»، «حفظ الدرجة»), states are passive («اتسلّم»، «اتصحّح»), and
 * a line that describes a student to the marker does not gender the student.
 *
 * No teacher's name anywhere: the marker is «المصحّح», so nothing here needs a
 * tenant gate.
 */
export const dailyEssayCopy = {
  student: {
    meta: { title: 'السؤال المقالي' },
    page: {
      eyebrow: 'كل يوم سؤال',
      title: 'السؤال المقالي اليومي',
      lead: 'سؤال مقالي واحد كل يوم. الحل بخط الإيد وصورة من الكراسة، أو كتابة هنا — وبعد التصحيح الدرجة والإجابة النموذجية بيظهروا جنب الحل.',
    },
    stats: {
      answered: 'أسئلة اتحلّت',
      marked: 'اتصحّحت',
      average: 'متوسط الدرجات',
    },
    card: {
      today: 'سؤال النهارده',
      yesterday: 'سؤال امبارح',
      /** `{max}` is a number: «من ١٠». */
      outOf: 'الدرجة من {max}',
      question: 'السؤال',
    },
    status: {
      open: 'مستني الحل',
      waiting: 'اتسلّم — مستني التصحيح',
      marked: 'اتصحّح',
      missed: 'فات من غير حل',
    },
    form: {
      modeLead: 'طريقة تسليم الحل:',
      modePhoto: 'صورة من الكراسة',
      modeType: 'كتابة الحل',
      photoTitle: 'رفع صور الحل',
      /** `{max}` is the question's own ceiling. */
      photoHint: 'صورة واضحة لكل صفحة من الحل — لحد {max} صورة.',
      pick: 'اختيار الصور',
      uploading: 'بنرفع…',
      remove: 'شيل الصورة',
      /** Follows a number: «٣ صور». */
      imageUnit: 'صورة',
      typeLabel: 'الحل مكتوب',
      typePlaceholder: 'الحل هنا…',
      typeCount: '{n} / {max}',
      submit: 'تسليم الحل',
      submitting: 'بنسلّم…',
      /** On an answer handed in and not marked yet, while the question is open. */
      replace: 'تغيير الحل',
      replaceHint: 'التصحيح لسه مابدأش، فالحل ممكن يتغيّر لحد ما السؤال يقفل.',
      cancel: 'إلغاء',
      /** Under the form — the window, said once. */
      window: 'كل سؤال بيفضل مفتوح للحل يوم نزوله واليوم اللي بعده.',
    },
    errors: {
      tooMany: 'الحد الأقصى {max} صورة للسؤال ده.',
      tooLarge: 'الصورة دي كبيرة أوي (أقصى حجم ٨ ميجا). لقطة شاشة للصورة نفسها بتحلّ المشكلة.',
      badType: 'الملف ده مش صورة. المطلوب صورة لصفحة الحل (JPG أو PNG أو صورة الموبايل العادية).',
      unreadable: 'مقدرناش نفتح الصورة دي. لقطة شاشة ليها أو صورة جديدة للصفحة غالبًا هتنفع.',
      network: 'النت فصل قبل ما الصورة تترفع. نجرّب تاني لما النت يرجع.',
      uploadFailed: 'مقدرناش نرفع الصورة. نجرّب تاني.',
      submitFailed: 'مقدرناش نسلّم الحل دلوقتي. نجرّب تاني.',
      empty: 'لازم صورة واحدة على الأقل للحل.',
      typeEmpty: 'الحل لسه فاضي.',
    },
    answer: {
      mine: 'حلّي',
      /** `{n}` is `imageCount`, kept after the pictures themselves are gone. */
      photos: 'اتسلّم {n} صورة',
      typed: 'اتسلّم مكتوب',
      imagesGone: 'الصور اتشالت بعد التصحيح، والحل متسجّل.',
      waitingBody: 'الحل وصل. أول ما يتصحّح، الدرجة والإجابة النموذجية هيظهروا هنا.',
      mark: 'الدرجة',
      /** «٨ من ١٠» — both numbers. */
      outOf: '{mark} من {max}',
      note: 'ملاحظة المصحّح',
      model: 'الإجابة النموذجية',
      modelLocked: 'الإجابة النموذجية بتظهر بعد التصحيح.',
    },
    history: {
      title: 'الأسئلة اللي فاتت',
      empty: 'لسه مفيش أسئلة فاتت.',
    },
    empty: {
      title: 'مفيش سؤال النهارده',
      body: 'السؤال الجديد بينزل هنا أول ما يتحدد له يوم.',
      bodyWithHistory: 'مفيش سؤال جديد النهارده. الأسئلة اللي فاتت تحت، بدرجاتها وإجاباتها النموذجية.',
    },
    /** The card on the dashboard. */
    home: {
      title: 'سؤال مقالي اليوم',
      titleYesterday: 'سؤال امبارح المقالي لسه مفتوح',
      cta: 'حل السؤال',
      ctaWaiting: 'متابعة الحل',
      ctaMarked: 'الدرجة والإجابة النموذجية',
      waiting: 'الحل اتسلّم — مستني التصحيح',
      /** «اتصحّح: ٨ من ١٠». */
      marked: 'اتصحّح: {mark} من {max}',
      hint: 'الحل بصورة من الكراسة أو كتابة',
    },
  },

  admin: {
    title: 'الأسئلة المقالية اليومية',
    lead: 'سؤال مقالي كل يوم بإجابته النموذجية. الطلبة بيحلّوا بصورة من الكراسة أو كتابة، والتصحيح من هنا.',
    tabs: { marking: 'التصحيح', schedule: 'جدول الأسئلة' },

    queue: {
      filters: { pending: 'مستني تصحيح', marked: 'اتصحّح', all: 'الكل' },
      emptyPending: 'مفيش إجابات مستنية تصحيح.',
      empty: 'مفيش إجابات هنا.',
      /** The big button over the queue. `{n}` is how many are waiting. */
      start: 'بدء التصحيح ({n})',
      mark: 'تصحيح',
      view: 'عرض',
      typed: 'مكتوب',
      imageUnit: 'صورة',
      /** `{day}` is the question's date. */
      essayDay: 'سؤال {day}',
      /** `{name}` is the marker. */
      markedBy: 'تصحيح {name}',
      /** Shown when the queue is narrowed to one question. */
      onlyEssay: 'إجابات سؤال {day} بس',
      allEssays: 'كل الأسئلة',
      pagePrev: 'السابق',
      pageNext: 'التالي',
      pageOf: '{from}–{to} من {total}',
    },

    schedule: {
      filters: { upcoming: 'الجاية', past: 'اللي فاتت', all: 'الكل' },
      add: 'إضافة أسئلة',
      empty: 'مفيش أسئلة متجدولة هنا.',
      emptyHint: 'إضافة مجموعة أسئلة مرة واحدة بتوزّعها على الأيام لوحدها.',
      today: 'النهارده',
      hidden: 'مخفي',
      everyone: 'كل المشتركين',
      /** `{n}` numbers. */
      answers: '{n} إجابة',
      pending: '{n} مستني تصحيح',
      marks: 'من {n}',
      model: 'الإجابة النموذجية',
      edit: 'تعديل',
      hide: 'إخفاء',
      show: 'إظهار',
      remove: 'حذف',
      removeConfirm: 'نحذف السؤال ده؟',
      removeRefused: 'السؤال عليه إجابات فمش بيتحذف — ممكن إخفاؤه.',
      openAnswers: 'الإجابات',
      failed: 'مقدرناش نحفظ. نجرّب تاني.',
    },

    form: {
      addTitle: 'إضافة أسئلة مقالية',
      editTitle: 'تعديل السؤال',
      back: 'رجوع',
      courses: 'الأسئلة لمين؟',
      coursesHint: 'من غير اختيار كورس، الأسئلة بتنزل لكل الطلبة المشتركين.',
      startDay: 'أول يوم',
      day: 'اليوم',
      skipFriday: 'من غير يوم الجمعة',
      maxImages: 'أقصى عدد صور للحل',
      /** `{n}` is the question's place in the batch. */
      questionN: 'السؤال {n}',
      body: 'نص السؤال',
      modelAnswer: 'الإجابة النموذجية',
      maxMarks: 'الدرجة من',
      addAnother: 'سؤال كمان',
      removeItem: 'شيل السؤال',
      /** `{day}` is a formatted date. */
      landsOn: 'هينزل {day}',
      /** `{n}` questions between two formatted dates. */
      summary: '{n} سؤال — من {first} لحد {last}',
      save: 'حفظ وجدولة',
      saveEdit: 'حفظ',
      saving: 'بنحفظ…',
      failed: 'مقدرناش نحفظ. نجرّب تاني.',
      incomplete: 'كل سؤال محتاج نص وإجابة نموذجية.',
      /** `{n}` questions were scheduled. */
      created: 'اتجدول {n} سؤال.',
    },

    marking: {
      back: 'رجوع للتصحيح',
      question: 'السؤال',
      modelAnswer: 'الإجابة النموذجية',
      answer: 'إجابة الطالب',
      imagesGone: 'الصور اتشالت بعد التصحيح.',
      imagesExpired: 'الصور اتشالت بعد ٣٠ يوم من غير تصحيح.',
      rotateImage: 'لفّ الصورة',
      mark: 'الدرجة',
      /** «من ١٠». */
      outOf: 'من {max}',
      note: 'ملاحظة للطالب (اختياري)',
      suggestions: 'ملاحظات جاهزة',
      save: 'حفظ الدرجة',
      saveNext: 'حفظ والتالي',
      saving: 'بنحفظ…',
      failed: 'مقدرناش نحفظ الدرجة. نجرّب تاني.',
      /** Under the button — marking is what deletes the photographs. */
      warning: 'حفظ الدرجة بيمسح صور الحل، والدرجة والملاحظة بيوصلوا للطالب.',
      /** `{n}` answers still waiting. */
      remaining: 'فاضل {n} إجابة مستنية',
      skip: 'تخطّي للتالي',
      currentMark: 'الدرجة الحالية',
      openProfile: 'ملف الطالب',
      submittedAt: 'اتسلّم',
    },

    /**
     * The canned notes on the marking form — one tap instead of a typed
     * sentence on the two-hundredth answer. Addressed to the student, so none
     * of them inflects for a reader.
     */
    notes: [
      'إجابة ممتازة ومرتّبة.',
      'إجابة كويسة، وناقصها مثال يوضّح.',
      'الفكرة صح، والترتيب محتاج شغل.',
      'ناقص جزء من المطلوب في السؤال.',
      'مقارنة الحل بالإجابة النموذجية هتوضّح الفرق.',
      'الخط في الصورة محتاج يبقى أوضح المرة الجاية.',
    ],
  },
} as const;
