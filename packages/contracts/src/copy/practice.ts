/**
 * «اختبارات مجانية» — the public, no-account self-test on every lesson.
 *
 * A module of its own rather than a key in `copy/ar.ts`, for the reason
 * `copy/mistakes.ts` gives: a tab left open from an older build has no module
 * id for a path that did not exist when it loaded
 * (`turbopack-module-ids-outlive-a-deploy`).
 *
 * ⚠️ Read by a visitor nobody knows anything about — not even whether they are
 * a student. Every line is a nominal sentence or the first person plural, never
 * an imperative or a participle that inflects for a boy or a girl
 * (`quiz-voice.spec.ts` is the tripwire). Buttons are masdars — «بدء
 * الاختبار», not «ابدأ». The section is NOT called «اختبر نفسك» for the same
 * reason: «اختبر» is said to a boy.
 *
 * `{count}` everywhere is `arabicCount(n, quizExperience.counts.questions)` —
 * «20 سؤال», «3 أسئلة».
 */
export const practiceCopy = {
  meta: {
    indexTitle: 'اختبارات مجانية على كل درس — البرمجة والذكاء الاصطناعي بكالوريا',
    indexDescription:
      'اختبار مجاني من غير تسجيل على كل درس في البرمجة والذكاء الاصطناعي لأولى وتانية ثانوي بكالوريا، عربي ولغات، بالتصحيح والشرح فورًا.',
    /** `{year}` the grade label, `{track}` عربي/لغات. */
    trackTitle: 'اختبارات البرمجة والذكاء الاصطناعي {year} {track} — مجانًا',
    trackDescription:
      'اختبار مجاني على كل درس في منهج {year} ({track})، من غير تسجيل، بالتصحيح والشرح بعد كل سؤال.',
    /** `{lesson}` is the lesson title. */
    setTitle: 'اختبار على درس {lesson} أونلاين — {year} {track}',
    setDescription:
      '{count} على درس {lesson} ({year} {track})، اختيار وصح وغلط، بالتصحيح والشرح بعد كل سؤال — من غير تسجيل.',
  },
  years: { 1: 'أولى ثانوي بكالوريا', 2: 'تانية ثانوي بكالوريا' },
  yearsShort: { 1: 'أولى ثانوي', 2: 'تانية ثانوي' },
  tracks: { arabic: 'عربي', languages: 'لغات' },
  trackNotes: {
    arabic: 'الأسئلة بالعربي، بنفس ألفاظ كتاب الوزارة',
    languages: 'الأسئلة بالإنجليزي، بنفس مصطلحات كتاب اللغات',
  },
  index: {
    badge: 'مجانًا · من غير تسجيل',
    title: 'اختبارات مجانية على كل درس',
    lead: 'أسئلة على شكل الامتحان، والتصحيح والشرح بعد كل سؤال، والنتيجة بتتحفظ على الجهاز ده عشان مستواك في كل درس يبقى قدامك.',
    chooseHeading: 'الاختبارات لأنهي سنة؟',
    chooseLead: 'اختيار السنة، وبعدها عربي ولا لغات، وبعدها الدرس.',
    lessons: '{n} درس',
    open: 'فتح الاختبارات',
    best: 'أعلى نتيجة: {score} من {total}',
    notYet: 'لسه ما اتحلّش',
    start: 'بدء الاختبار',
    /** Followed by the lesson code, which the page isolates as an LTR run. */
    lessonCode: 'درس',
    empty: 'لسه مفيش اختبارات منشورة هنا — قريب.',
    otherTrack: 'اختبارات {track}',
    stats: {
      questions: 'سؤال',
      lessons: 'درس',
      instant: 'تصحيح وشرح فوري',
    },
  },
  /** The section on the landing page. */
  invite: {
    eyebrow: 'مجانًا · من غير تسجيل',
    title: 'اختبارات مجانية على كل درس',
    lead: 'مستواك في كل درس في دقايق: أسئلة على شكل الامتحان، والإجابة الصح وشرحها بعد كل سؤال، ونتيجة بتتحفظ عشان المذاكرة تبقى على أساس.',
    year2: 'اختبارات تانية ثانوي',
    year1: 'اختبارات أولى ثانوي',
    all: 'كل الاختبارات',
  },
  run: {
    back: 'كل الاختبارات',
    intro: '{count} على الدرس، من الأسهل للأصعب. بعد كل إجابة بيظهر الصح والشرح، وفي الآخر النتيجة ومستواك.',
    start: 'بدء الاختبار',
    steps: ['إجابة سؤال سؤال', 'الصح والشرح على طول', 'النتيجة ومستواك في الآخر'],
    progress: 'سؤال {n} من {total}',
    scoreSoFar: '{n} صح لحد دلوقتي',
    true: 'صح',
    false: 'غلط',
    /** The Languages track's statements are English, so their two buttons are too. */
    trueEn: 'True',
    falseEn: 'False',
    correct: 'إجابة صح',
    wrong: 'إجابة غلط',
    rightAnswer: 'الإجابة الصح: {answer}',
    explanation: 'الشرح',
    next: 'السؤال اللي بعده',
    finish: 'النتيجة',
    optionsLabel: 'الاختيارات',
  },
  result: {
    heading: 'النتيجة',
    score: '{score} من {total}',
    percent: '{p}٪',
    bands: {
      excellent: { label: 'ممتاز', note: 'الدرس ده متذاكر كويس جدًا. الخطوة الجاية درس جديد.' },
      great: { label: 'كويس جدًا', note: 'قريب جدًا من الدرجة النهائية — الأسئلة اللي تحت هي اللي فاضلة.' },
      good: { label: 'كويس', note: 'الأساس موجود، ومراجعة الأسئلة الغلط تحت بتقفل الفجوة.' },
      review: { label: 'محتاج مراجعة', note: 'الدرس محتاج قراية تانية — شرح الدرس كامل في اللينك تحت، وبعده إعادة الاختبار.' },
    },
    best: 'أعلى نتيجة على الجهاز ده في الدرس ده: {score} من {total}',
    newBest: 'رقم قياسي جديد في الدرس ده',
    mistakesHeading: 'الأسئلة اللي محتاجة مراجعة',
    noMistakes: 'ولا غلطة — كل الإجابات صح.',
    yourAnswer: 'الإجابة اللي اتختارت: {answer}',
    retry: 'إعادة الاختبار',
    lessonArticle: 'شرح الدرس كامل',
    another: 'اختبار درس تاني',
    courseTitle: 'الدرس بالفيديو والتمارين',
    courseBody: 'كل درس مشروح فيديو، ومعاه تمرين واختبار بدرجة محفوظة، وامتحانات شهرية.',
    courseCta: 'تفاصيل الكورس',
  },
  /** The anchor text people type, as `copy.news.footerLink` does. */
  footerLink: 'اختبارات مجانية',
} as const;
