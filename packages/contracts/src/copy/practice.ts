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
 * (`practice-voice.spec.ts` is the tripwire). Buttons are masdars — «بدء
 * الاختبار», not «ابدأ».
 */
export const practiceCopy = {
  /** `{count}` everywhere is `arabicCount(n, quizExperience.counts.questions)` — «20 سؤال», «3 أسئلة». */
  meta: {
    indexTitle: 'اختبارات مجانية على كل درس — البرمجة والذكاء الاصطناعي بكالوريا',
    indexDescription:
      'اختبار مجاني من غير تسجيل على كل درس في البرمجة والذكاء الاصطناعي لأولى وتانية ثانوي بكالوريا، بالتصحيح والشرح فورًا.',
    /** `{lesson}` is the lesson title, `{year}` the grade label. */
    setTitle: 'اختبار على درس {lesson} أونلاين — {year}',
    setDescription:
      '{count} على درس {lesson} ({year})، اختيار وصح وغلط، بالتصحيح والشرح بعد كل سؤال — من غير تسجيل.',
  },
  index: {
    badge: 'مجانًا · من غير تسجيل',
    title: 'اختبارات مجانية على كل درس',
    lead: 'اختيار درس، وأسئلة على شكل الامتحان، والتصحيح والشرح بعد كل سؤال. النتيجة بتتحفظ على الجهاز ده عشان مستواك في كل درس يبقى قدامك.',
    yearHeading: { 1: 'أولى ثانوي بكالوريا', 2: 'تانية ثانوي بكالوريا' },
    best: 'أعلى نتيجة: {score} من {total}',
    notYet: 'لسه ما اتحلّش',
    start: 'بدء الاختبار',
    retry: 'إعادة الاختبار',
    /** Followed by the lesson code, which the page isolates as an LTR run. */
    lessonCode: 'درس',
  },
  run: {
    back: 'كل الاختبارات',
    intro: '{count} على الدرس، من الأسهل للأصعب. بعد كل إجابة بيظهر الصح والشرح، وفي الآخر النتيجة ومستواك.',
    start: 'بدء الاختبار',
    progress: 'سؤال {n} من {total}',
    scoreSoFar: '{n} صح لحد دلوقتي',
    true: 'صح',
    false: 'غلط',
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
