/**
 * «اختبارات مجانية» — the dashboard side: `/admin/practice` and the set
 * editor under it.
 *
 * A module of its own rather than more keys in `copy/admin.ts`, for the reason
 * `copy/practice.ts` gives for the public side: a tab left open from an older
 * build has no module id for a path that did not exist when it loaded
 * (`turbopack-module-ids-outlive-a-deploy`), and the admin table is already
 * the largest file in the package.
 *
 * ⚠️ Read by the instructor AND by any assistant he gives `question:write` to,
 * so the screen addresses nobody: buttons are masdars («حفظ»، «إضافة سؤال»),
 * hints are nominal sentences. `quiz-voice.spec.ts` carries this table.
 *
 * `{count}` groups are `ArabicCountForms` for `arabicCount()`; `{n}` and the
 * other braces go through `formatCopy`.
 */
export const adminPractice = {
  nav: 'اختبارات مجانية',
  title: 'اختبارات مجانية',
  eyebrow: 'من غير تسجيل · على كل درس',
  lead: 'اختبار قصير على كل درس، مفتوح لأي زائر من غير حساب، والتصحيح والشرح بعد كل سؤال. الدرس بيظهر على الموقع أول ما يتنشر ويبقى فيه سؤال واحد على الأقل.',

  counts: {
    questions: { one: 'سؤال واحد', two: 'سؤالين', few: '{count} أسئلة', many: '{count} سؤال' },
  },

  stats: {
    sets: 'درس عليه اختبار',
    questions: 'سؤال في الكل',
    published: 'منشور على الموقع',
    drafts: 'مسودة',
  },

  years: { 1: 'أولى ثانوي', 2: 'تانية ثانوي' } as Record<1 | 2, string>,
  tracks: { arabic: 'عربي', languages: 'لغات' } as Record<'arabic' | 'languages', string>,

  filters: {
    label: 'عرض الدروس',
    year: 'السنة',
    track: 'الشعبة',
    all: 'الكل',
  },

  /** `{n}` is the unit number — the part of the lesson code before the dash. */
  unit: 'الوحدة {n}',
  /** Before the lesson code chip, which is isolated as an LTR run. */
  lessonCode: 'درس',
  published: 'منشور',
  draft: 'مسودة',
  publishedToggle: 'منشور على الموقع',
  /** Under a published set with no questions: published, and still invisible. */
  publishedButEmpty: 'منشور، بس مش ظاهر لحد ما يتضاف سؤال',
  updated: 'آخر تعديل {date}',

  actions: {
    editQuestions: 'تعديل الأسئلة',
    openPage: 'فتح الصفحة',
    delete: 'حذف',
    cancel: 'إلغاء',
    close: 'إغلاق',
  },

  deleteSet: {
    title: 'حذف اختبار «{title}»؟',
    body: 'الاختبار وأسئلته ({count}) هيتمسحوا نهائي، وصفحته هتختفي من الموقع. الحذف ده مالوش رجوع.',
    confirm: 'حذف نهائي',
    done: 'اتمسح الاختبار',
  },

  empty: {
    title: 'لسه مفيش اختبارات هنا',
    hint: 'أول اختبار بيبدأ من «إضافة درس»، وبعدها الأسئلة واحد واحد أو لصق مرة واحدة.',
    filtered: 'مفيش دروس بالاختيار ده.',
  },

  /** The API 404s every practice route while `practice.enabled` is off on this stack. */
  disabled: {
    title: 'الاختبارات المجانية مقفولة على المنصة دي',
    hint: 'بتتفتح من صفحة الفلاجات (practice.enabled)، وبعدها الدروس والأسئلة بتتضاف من هنا. الصفحة العامة بتفضل مستخبية لحد ما يبقى فيه درس منشور.',
    action: 'فتح الفلاجات',
  },

  create: {
    open: 'إضافة درس',
    title: 'درس جديد عليه اختبار',
    lead: 'الدرس بيتضاف مسودة، ومحدش بيشوفه غير بعد النشر.',
    year: 'السنة',
    track: 'الشعبة',
    lessonCode: 'رقم الدرس',
    lessonCodeHint: 'الوحدة ثم الدرس بشَرطة، زي 2-1 أو 6-10. ده نفسه آخر جزء في رابط الصفحة.',
    lessonTitle: 'عنوان الدرس',
    lessonTitleHint: 'زي «حقوق الملكية الفكرية» — بيظهر على الكارت وفي عنوان الصفحة.',
    unitTitle: 'اسم الوحدة (اختياري)',
    unitTitleHint: 'زي «الوحدة الثانية: الأمن السيبراني». من غيره بيظهر «الوحدة 2».',
    articleSlug: 'رابط شرح الدرس (اختياري)',
    articleSlugHint: 'الجزء الأخير من رابط المقال في «نيوز»، لو فيه شرح مجاني للدرس.',
    submit: 'إضافة الدرس',
    done: 'اتضاف الدرس',
  },

  errors: {
    failed: 'الحفظ ما تمّش. ممكن المحاولة تاني بعد لحظة.',
    forbidden: 'الصلاحية دي مش متاحة على الحساب ده.',
    taken: 'الدرس ده موجود بالفعل لنفس السنة والشعبة.',
    notFound: 'الاختبار ده اتمسح أو مش موجود.',
    lessonCode: 'رقم الدرس لازم يبقى بالشكل 2-1.',
    lessonTitle: 'عنوان الدرس قصير — حرفين على الأقل.',
  },

  editor: {
    back: 'كل الاختبارات',
    meta: 'بيانات الدرس',
    metaHint: 'السنة والشعبة ورقم الدرس هما رابط الصفحة، فتغييرهم بيغيّر الرابط.',
    saveMeta: 'حفظ البيانات',
    saved: 'اتحفظ',
    questions: 'الأسئلة',
    noQuestions: 'لسه مفيش أسئلة على الدرس ده.',
    noQuestionsHint: 'سؤال واحد بيكفي عشان الصفحة تظهر بعد النشر.',
    add: 'إضافة سؤال',
    paste: 'لصق أسئلة كتير',
    publicLink: 'رابط الصفحة',
  },

  question: {
    /** The card's badge — short on purpose. */
    types: { mcq: 'اختيار', tf: 'صح وغلط' },
    /** The editor's toggle — the long names. */
    typeToggle: { mcq: 'اختيار من متعدد', tf: 'صح وغلط' },
    typeLabel: 'نوع السؤال',
    number: 'سؤال {n}',
    stem: 'نص السؤال',
    stemPlaceholder: 'زي: أي من الآتي يعتبر من حقوق الملكية الفكرية؟',
    options: 'الاختيارات',
    optionsHint: 'من 2 لـ 6 اختيارات، والدايرة جنب الاختيار هي الإجابة الصح.',
    /** `{letter}` is أ ب ج … */
    optionLabel: 'الاختيار {letter}',
    addOption: 'إضافة اختيار',
    removeOption: 'حذف الاختيار {letter}',
    correct: 'الإجابة الصح',
    markCorrect: 'الإجابة الصح هي {letter}',
    tfAnswer: 'الإجابة الصح',
    true: 'صح',
    false: 'غلط',
    explanation: 'الشرح (اختياري)',
    explanationHint: 'بيظهر بعد الإجابة، صح أو غلط — أنسب مكان لسبب الإجابة.',
    explanationLabel: 'الشرح',
    noExplanation: 'من غير شرح',
    preview: 'معاينة: كده هيظهر على الصفحة',
    previewEmpty: 'نص السؤال بيظهر هنا أول ما يتكتب.',
    previewRight: 'الإجابة الصح',
    add: 'إضافة السؤال',
    save: 'حفظ السؤال',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    added: 'اتضاف السؤال',
    savedToast: 'اتحفظ السؤال',
    deleteTitle: 'حذف السؤال {n}؟',
    deleteBody: 'السؤال هيتمسح من الاختبار نهائي، ومالوش رجوع.',
    deleteConfirm: 'حذف السؤال',
    deleted: 'اتمسح السؤال',
    moveUp: 'تحريك السؤال {n} لفوق',
    moveDown: 'تحريك السؤال {n} لتحت',
    drag: 'سحب السؤال {n} لتغيير ترتيبه',
    reorderSaving: 'بيتحفظ الترتيب…',
    reorderSaved: 'اتحفظ الترتيب',
    reorderFailed: 'الترتيب ما اتحفظش، ورجع زي ما كان.',
    announce: {
      pickedUp: 'السؤال في المكان {n}، جاهز للتحريك.',
      movedOver: 'المكان {n}.',
      dropped: 'السؤال بقى في المكان {n}.',
      cancelled: 'التحريك اتلغى، والترتيب زي ما هو.',
    },
    errors: {
      stem: 'نص السؤال قصير — 3 حروف على الأقل.',
      stemLong: 'نص السؤال أطول من 1000 حرف.',
      optionEmpty: 'فيه اختيار فاضي.',
      optionLong: 'فيه اختيار أطول من 400 حرف.',
      optionsCount: 'الاختيار من متعدد محتاج اختيارين على الأقل.',
      distinct: 'فيه اختيارين بنفس الكلام.',
      answer: 'الإجابة الصح لسه ما اتحددتش.',
      explanationLong: 'الشرح أطول من 1500 حرف.',
    },
  },

  paste: {
    title: 'لصق أسئلة كتير',
    lead: 'كل سؤال في فقرة لوحده، وبين كل سؤال والتاني سطر فاضي. الاختيارات بحروف (أ) ب) ج) أو A. B. C.)، وبعدها سطر «الإجابة:» وسطر «الشرح:» لو فيه.',
    exampleHeading: 'شكل اللصق',
    example:
      'أي من الآتي من حقوق الملكية الفكرية؟\nأ) حق المؤلف\nب) حق الانتخاب\nج) حق التعليم\nالإجابة: أ\nالشرح: حق المؤلف بيحمي العمل الأصلي.\n\nبراءة الاختراع بتحمي الفكرة لمدة محدودة.\nأ) صح\nب) غلط\nالإجابة: أ',
    textLabel: 'الأسئلة',
    previewHeading: 'المعاينة',
    previewEmpty: 'الأسئلة بتظهر هنا أول ما تتلصق.',
    /** `{n}` questions parsed / blocks with a problem. */
    summaryReady: '{n} جاهز',
    summaryBad: '{n} فيه مشكلة',
    block: 'فقرة {n}',
    unsupported: 'النوع ده مش متاح هنا — اختيار بإجابة واحدة أو صح وغلط بس.',
    tooManyOptions: 'أكتر من 6 اختيارات.',
    commit: 'إضافة الأسئلة',
    /** `{count}` from `counts.questions`. */
    commitN: 'إضافة {count}',
    blockedByErrors: 'الإضافة متاحة لما كل الفقرات تبقى سليمة.',
    added: 'اتضاف {count} للاختبار',
  },
};

export type AdminPracticeCopy = typeof adminPractice;
