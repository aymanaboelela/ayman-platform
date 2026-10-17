/**
 * The quiz experience, end to end, in one table: what the runner says around
 * the question, the confirmation a student meets before handing a paper in,
 * the result screen they land on, the notes under each reviewed answer, and
 * the book-practice flow that is built out of all of them.
 *
 * ## Its own module, not more keys on `copy.quiz`
 *
 * Turbopack derives a client module's id from its file path, and a tab left
 * open across a deploy keeps the PREVIOUS build's factory for that id. A key
 * added to `copy/ar.ts` is therefore `undefined` for exactly the students who
 * are mid-exam when a release lands — and `arabicCount(n, undefined)` is a
 * crash on the submit dialog, the one screen that must never have one. A path
 * that did not exist before has no stale factory anywhere. (`copy/mistakes.ts`
 * and `copy/arena.ts` were split out for the same reason.)
 *
 * Existing keys that these screens already read (`copy.quiz.submit`,
 * `submitConfirmAction`, `submitConfirmAllAnswered`, `resultsTitle`…) stay
 * where they are: the e2e suite finds the runner by them, and changing a
 * VALUE is safe across a deploy where adding a key is not.
 *
 * ## The voice
 *
 * Every line is read by a boy or a girl and the platform never asks which, so
 * nothing here inflects for the reader — the four devices `copy/outreach.ts`
 * sets out: first person plural («نسلّم»، «نرجع»), nominal sentences instead of
 * imperatives («الضغط على رقم السؤال بيرجّع له»), passives for what happened
 * («اتجاوب»), and the ـك suffix on a NOUN only («درجاتك»). `quiz-voice.spec.ts`
 * walks this whole table for the forms that only work on a male reader.
 *
 * ## Counted nouns
 *
 * `counts.*` and every other `{ one, two, few, many }` group are
 * `ArabicCountForms` for `arabicCount()` — «سؤال واحد»، «سؤالين»، «3 أسئلة»،
 * «11 سؤال». A single `'{n} سؤال'` template reads «3 سؤال» and «1 سؤال», which
 * is how nobody says it, on the dialog whose whole job is to be read in one
 * glance under a running clock. Western digits, like every number in the
 * product (`ar-EG-u-nu-latn`).
 */
export const quizExperience = {
  counts: {
    questions: { one: 'سؤال واحد', two: 'سؤالين', few: '{count} أسئلة', many: '{count} سؤال' },
    marks: { one: 'درجة واحدة', two: 'درجتين', few: '{count} درجات', many: '{count} درجة' },
    words: { one: 'كلمة واحدة', two: 'كلمتين', few: '{count} كلمات', many: '{count} كلمة' },
    books: { one: 'كتاب واحد', two: 'كتابين', few: '{count} كتب', many: '{count} كتاب' },
    units: { one: 'وحدة واحدة', two: 'وحدتين', few: '{count} وحدات', many: '{count} وحدة' },
    lessons: { one: 'درس واحد', two: 'درسين', few: '{count} دروس', many: '{count} درس' },
  },

  /* ── the exam's own page, before a sitting ─────────────────────────────── */
  intro: {
    /** The four tiles' labels. The number is the tile's VALUE, so the label
     *  no longer repeats it («20 / 20 سؤال») — and a label with no number in
     *  it has no counted noun to get wrong. */
    questions: 'عدد الأسئلة',
    marks: 'الدرجة الكلية',
    minutes: 'المدة بالدقايق',
  },

  /* ── around the question, in the runner ────────────────────────────────── */
  runner: {
    /** The navigator's key. One swatch per state the grid draws. (The
     *  answered count and the flag's own name are `copy.quiz.answeredCount`
     *  and `copy.quiz.flag`, whose VALUES were made neutral in place.) */
    legendCurrent: 'السؤال الحالي',
    legendAnswered: 'اتجاوب',
    legendOpen: 'لسه',
    legendFlagged: 'علامة مراجعة',
    /** The navigator chip's accessible name, with its state — the visible
     *  chip is just «03», and its fill and dot say nothing to a screen
     *  reader. Four whole sentences rather than fragments joined in the
     *  component, which is the one interpolation `formatCopy` forbids. */
    chipOpen: 'السؤال {n}، لسه من غير إجابة',
    chipAnswered: 'السؤال {n}، اتجاوب',
    chipOpenFlagged: 'السؤال {n}، لسه من غير إجابة، وعليه علامة مراجعة',
    chipAnsweredFlagged: 'السؤال {n}، اتجاوب، وعليه علامة مراجعة',
    /** An essay's limits, which the paper always carried in `settings` and
     *  never showed: a student found out about a minimum only by not knowing
     *  one existed. Label and figure, for the agreement reason above. */
    wordsMin: 'أقل عدد كلمات: {n}',
    wordsMax: 'أقصى عدد كلمات: {n}',
  },

  /* ── «نسلّم الامتحان؟» ─────────────────────────────────────────────────── */
  submit: {
    /** The headline when the server's own count says something is blank. */
    unanswered: {
      one: 'لسه فيه سؤال واحد من غير إجابة',
      two: 'لسه فيه سؤالين من غير إجابة',
      few: 'لسه فيه {count} أسئلة من غير إجابة',
      many: 'لسه فيه {count} سؤال من غير إجابة',
    },
    /** …and the question it is asking. Count-agnostic on purpose: «نرجع
     *  نجاوب عليه» against «عليهم» is one more agreement to get wrong. */
    unansweredAsk: 'نسلّم دلوقتي، ولا نرجع للأسئلة الأول؟',
    /** Above the chips. What a chip does, said once. */
    jumpHint: 'الضغط على رقم السؤال بيفتحه على طول.',
    groupUnanswered: 'من غير إجابة',
    groupFlagged: 'عليها علامة مراجعة',
    /** Each chip's accessible name. The visible text is just «سؤال ٣»; a
     *  screen reader needs to hear WHICH list it is in. */
    chipUnanswered: 'سؤال {n} — من غير إجابة',
    chipFlagged: 'سؤال {n} — عليه علامة مراجعة',
    /** While the server's count is on its way. */
    counting: 'بنعدّ الإجابات…',
    /** The count could not be fetched. Says the one thing that matters: the
     *  button still works — the server recounts on submit anyway. */
    countFailed: 'مقدرناش نعدّ الإجابات دلوقتي، بس التسليم شغال عادي.',
    countRetry: 'نعدّ تاني',
    /** The clock, said in minutes — a ticking «12:41» inside a confirmation
     *  is pressure, and the exact seconds are on the bar behind it. */
    timeLeft: {
      one: 'فاضل دقيقة واحدة',
      two: 'فاضل دقيقتين',
      few: 'فاضل {count} دقايق',
      many: 'فاضل {count} دقيقة',
    },
    timeUnderMinute: 'فاضل أقل من دقيقة',
    /** Under the clock line while there is still real time on it. */
    timeEnough: 'في وقت كافي للمراجعة قبل التسليم.',
  },

  /* ── the result, on the screen a submit lands on ───────────────────────── */
  result: {
    /** Under the percentage chip. */
    percentLabel: 'النسبة',
    /**
     * One message per BAND, and the bands are `/results`'s: violet from
     * «امتياز» up, green over the paper's own pass mark, amber under it.
     * Amber, not red, for the low band — the verdict badge beside it already
     * says «محتاجة مراجعة» in the one colour licensed to say it, and a red
     * banner under a red badge reads as being told off twice. Titles match
     * the band names `/results` uses, so a 40% here and a 40% average there
     * are called the same thing.
     */
    bands: {
      high: {
        title: 'أداء ممتاز',
        body: 'درجة عالية ومجهود باين. نظرة سريعة على المراجعة تحت بتثبّت المعلومة.',
      },
      pass: {
        title: 'أداء كويس',
        body: 'نجاح يستاهل. الأسئلة اللي فاتت متعلّمة تحت بالإجابة الصحيحة والشرح، ومراجعتها دلوقتي بتقرّب الدرجة الكاملة.',
      },
      low: {
        title: 'لسه في الطريق',
        body: 'الدرجة دي بداية مش نهاية. مراجعة الغلطات تحت مع الشرح، وبعدها رجوع للدرس، بتفرق كتير في المرة الجاية.',
      },
      /** Essays still with the instructor — `copy.quiz.pendingRest` and
       *  `pendingWillArrive` carry the amounts underneath this title. */
      pending: {
        title: 'الأسئلة المقالية بتتصحّح',
      },
    },
  },

  /* ── the reviewed paper ─────────────────────────────────────────────────── */
  review: {
    /** Above the title on `/quizzes/:id/attempt/:id/review` — the screen had
     *  no way back to the exam page except the browser. */
    backToQuiz: 'صفحة الامتحان',
    /** The filter line on a paper with nothing wrong YET: the essays are
     *  still unmarked, so «ورقة كاملة» and a pass badge would be a verdict
     *  the result header right above it is careful not to give. */
    allCorrectSoFar: 'مفيش ولا غلطة في اللي اتصحّح لحد دلوقتي',
  },

  /* ── «أسئلة الكتب الخارجية» ─────────────────────────────────────────────── */
  books: {
    /** The section on the course page in «كورساتي». */
    sectionTitle: 'أسئلة الكتب الخارجية',
    sectionLead: 'بنوك أسئلة على المنهج، درس بدرس ووحدة بوحدة — والتصحيح والشرح أول ما التدريب يتسلّم.',
    /** Under a book's title: three counted nouns. */
    bookMeta: '{questions} · {units} · {lessons}',
    openBookLabel: 'فتح الكتاب: {title}',
    /** On each book card, beside the counts. */
    questionsReady: {
      one: 'سؤال واحد جاهز',
      two: 'سؤالين جاهزين',
      few: '{count} أسئلة جاهزة',
      many: '{count} سؤال جاهز',
    },
    openBook: 'فتح الكتاب',

    /* the book's own page */
    metaTitle: '{title} — أسئلة وتدريبات',
    metaFallback: 'أسئلة الكتاب',
    backToCourse: 'الرجوع للكورس',
    eyebrow: 'كتاب أسئلة',
    /** `{label}` is `eyebrow`, `{course}` the course the book is linked to. */
    eyebrowCourse: '{label} · {course}',
    /** Under a unit's name: `{lessons}` and `{questions}` are counted nouns. */
    unitMeta: '{lessons} · {questions}',
    /** The row chip's accessible name — a column of «تدريب» buttons is
     *  twenty controls with one name to a screen reader. */
    lessonPracticeLabel: 'تدريب: {title}',
    lead: 'بنك أسئلة مقسّم على وحدات ودروس المنهج. التدريب على درس أو وحدة أو الكتاب كله، والنتيجة والشرح بيظهروا أول ما التدريب يتسلّم.',
    wholeBook: 'امتحان شامل على الكتاب كله',
    contentsTitle: 'فهرس الكتاب',
    contentsHint: 'كل درس وكل وحدة ليهم تدريب لوحدهم.',
    unitPractice: 'تدريب على الوحدة كلها',
    unitGeneral: 'أسئلة عامة على الوحدة',
    lessonPractice: 'تدريب',
    noQuestionsYet: 'لسه مفيش أسئلة',
    emptyBook: 'لسه مفيش وحدات في الكتاب ده.',
    emptyUnit: 'لسه مفيش دروس ولا أسئلة في الوحدة دي.',
    expandUnit: 'فتح الوحدة',
    collapseUnit: 'قفل الوحدة',
  },

  /* ── the practice gate: how many questions, and what to expect ────────── */
  practiceStart: {
    scope: {
      book: 'امتحان شامل على الكتاب',
      unit: 'تدريب على الوحدة',
      lesson: 'تدريب على الدرس',
    },
    countLabel: 'عدد الأسئلة',
    available: {
      one: 'متاح سؤال واحد بس',
      two: 'متاح سؤالين بس',
      few: 'متاح {count} أسئلة',
      many: 'متاح {count} سؤال',
    },
    /** The last chip — every ready question in the scope. */
    all: 'الكل ({count})',
    points: {
      freeTitle: 'التنقّل حر',
      freeBody: 'الرجوع لأي سؤال ممكن، والإجابة بتتغيّر لحد التسليم.',
      instantTitle: 'التصحيح فوري',
      instantBody: 'النتيجة بتظهر أول ما التدريب يتسلّم، ومعاها الإجابة الصحيحة والشرح لكل سؤال.',
      /** True by construction: a practice result lives in a cache for a week
       *  and is never written to `quiz_attempts`, so nothing reads it. */
      privateTitle: 'مش بيتسجّل في درجاتك',
      privateBody: 'ده تدريب للمذاكرة بس — مش بيدخل في النتايج ولا الترتيب.',
    },
    /** `{questions}` is `counts.questions` already said — «نبدأ — 10 أسئلة». */
    start: 'نبدأ التدريب — {questions}',
    starting: 'بنجهّز الأسئلة…',
    cancel: 'مش دلوقتي',
    failed: 'مقدرناش نجهّز التدريب دلوقتي — نجرّب تاني.',
    noQuestions: 'مفيش أسئلة جاهزة هنا لسه.',
  },

  /* ── the practice runner and its result ──────────────────────────────── */
  practice: {
    metaTitle: 'تدريب على أسئلة الكتاب',
    /** `{title}` — the book. The heading of a whole-book practice; a unit's
     *  or a lesson's is its own name. Written by the API into the session. */
    bookScopeTitle: 'امتحان شامل: {title}',
    backToBook: 'الرجوع للكتاب',
    submit: 'تسليم التدريب',
    submitTitle: 'نسلّم التدريب؟',
    submitBody: 'بعد التسليم بتظهر النتيجة والشرح على طول.',
    submitting: 'بيتصحّح…',
    submitFailed: 'مقدرناش نسلّم دلوقتي — الإجابات لسه هنا، نجرّب تاني.',
    /** The session lives 24 hours in Redis; after that its id is a 404. */
    sessionGone: 'التدريب ده خلص وقته — تدريب جديد من صفحة الكتاب.',
    emptySession: 'التدريب ده مفيهوش أسئلة.',
    /** On the result screen. */
    retake: 'تدريب جديد بأسئلة تانية',
    retaking: 'بنجهّز…',
    reviewTitle: 'مراجعة الإجابات والشرح',
  },
} as const;

export type QuizExperienceCopy = typeof quizExperience;
