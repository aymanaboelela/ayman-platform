/**
 * «رسايل م. أيمن» — the sentences the instructor's outreach messages are built
 * from.
 *
 * ## Why this is a table of POOLS and not a table of strings
 *
 * Every other copy block in this package answers "what does this label say".
 * This one answers "what does he say THIS time". A student who sits four
 * quizzes in a week gets four messages, and four identical ones would tell
 * them, unmistakably, that nobody wrote any of them — which is the single
 * failure this whole feature cannot survive. So each slot is an ARRAY, the
 * composer picks one per message, and `OutreachMessage.variantKey` records
 * which so the next message to the same student picks a different one
 * (`compose.ts`, `pickIndex`).
 *
 * A message is assembled from at most six slots:
 *
 *     {greeting}
 *     {opener}          ← names the quiz/lesson
 *     {scoreLine}       ← quiz results only, and BAND-SPECIFIC
 *     {focus}           ← the topics to go back to, when there are any
 *     {strength}        ← what they already own, when there is any
 *     {closer}          ← band-specific again
 *     {whatsapp}        ← sometimes, and never twice in a row
 *
 * ## The bands are not decoration
 *
 * `scoreLine` and `closer` are keyed by band because a 20٪ and a 95٪ cannot
 * share a sentence. «برافو» on a failed paper is worse than saying nothing:
 * it proves the sender did not look. The four pools exist so that the tone is
 * chosen by the score rather than averaged across it.
 *
 * ## No relative imports
 *
 * Same rule as `notifications.ts` and `activity.ts`: a leaf module both apps
 * reach through `@ayman/contracts/copy/outreach` without tripping Node's
 * native ESM loader on the root barrel.
 *
 * ## Placeholders
 *
 * `{name}` first name · `{quiz}` quiz title · `{lesson}` lesson title
 * `{score}` integer percent · `{topics}` an already-joined Arabic list.
 * Filled by `formatCopy`, never by concatenation.
 */

/** Score bands. The boundaries live in `compose.ts` (`bandFor`). */
export const OUTREACH_BANDS = ['excellent', 'strong', 'fair', 'weak'] as const;
export type OutreachBand = (typeof OUTREACH_BANDS)[number];

/**
 * Opens every message, whatever the kind.
 *
 * Deliberately short and deliberately varied in FORM, not just wording — some
 * lead with the name, some end with it, one names him. A pool where every
 * entry is «إزيك يا {name}» with a different emoji is not variety, it is the
 * same sentence wearing hats.
 */
export const OUTREACH_GREETINGS = [
  'إزيك يا {name} 👋',
  'أهلاً يا {name}',
  '{name}، عامل إيه؟',
  'يا هلا يا {name}',
  'إزيك يا {name}، أنا أيمن',
  'صباح الفل يا {name}',
  '{name}، إزي الحال؟',
] as const;

/**
 * «شفت نتيجتك» — the line that says he looked.
 *
 * Every entry is in the first person and every entry implies an act of
 * looking, because that is the entire message under the message.
 *
 * ⚠️ EVERY entry must carry `{quiz}`, and `compose.spec.ts` fails the build if
 * one does not. The first draft had an opener that named no paper — «كنت بمرّ
 * على نتايج الكويزات النهارده، ووقفت عند بتاعك» — and the rest of the message
 * never names one either: the score line is a bare number and the bullets name
 * TOPICS. A student who sat three papers that week could not tell which one it
 * was about, and one message in six was like that. It survived local runs and
 * only failed in CI, because which opener is drawn depends on a seed built
 * from ids that differ every run.
 */
export const QUIZ_RESULT_OPENERS = [
  'كنت بمرّ على نتايج الكويزات النهارده، ووقفت عند «{quiz}» بتاعك.',
  'شفت ورقتك في «{quiz}» وحبيت أقولك رأيي.',
  'عدّيت على نتيجتك في «{quiz}» وأنا بصحّح.',
  'بصّيت على «{quiz}» بتاعك من شوية.',
  'نتيجة «{quiz}» نزلت، وأنا قريتها.',
  'خلّصت مراجعة «{quiz}»، وده اللي طلع معايا.',
] as const;

/** The verdict on the number. Chosen by band — see the header. */
export const QUIZ_SCORE_LINES: Record<OutreachBand, readonly string[]> = {
  excellent: [
    '{score}٪ — ده مستوى امتحان بجد، مش كويز.',
    '{score}٪. إنت مذاكر، وباين من أول سؤال.',
    '{score}٪، وده مش حظ. ده شغل.',
    '{score}٪. صراحة كده أنا مبسوط.',
    'جبت {score}٪ — قليل اللي بيوصلوا للرقم ده.',
  ],
  strong: [
    '{score}٪ — رقم كويس، وقريّب أوي من الكامل.',
    '{score}٪. إنت فاهم، ناقص بس شويّة تدقيق.',
    '{score}٪، يعني الأساس عندك سليم.',
    '{score}٪ — تمام، بس أنا عارف إنك تقدر تجيب أكتر من كده.',
    '{score}٪. الفرق بينك وبين الكامل حاجات صغيّرة.',
  ],
  fair: [
    '{score}٪. مش وحش، بس فيه حتت لازم نرجعلها.',
    '{score}٪ — يعني نص الطريق. النص التاني في إيدك.',
    '{score}٪، والرقم ده بيتحسّن بسرعة لو مسكنا الأساس.',
    '{score}٪. ده كويز مش نهاية الدنيا — بس خلّينا نشتغل.',
    'جبت {score}٪، وأنا شايف بالظبط ناقصك إيه.',
  ],
  weak: [
    '{score}٪. الرقم قليل، وأنا بقولهالك عشان مهتم — مش عشان أزعّلك.',
    '{score}٪ — واضح إن الدرس عدّى من غير ما يستقر.',
    '{score}٪. خلّينا نرجع خطوة لورا ونبني صح.',
    '{score}٪، ومفيش مشكلة. المهم إننا عرفنا الغلط فين.',
    'جبت {score}٪. ده مش حكم عليك، ده بس بيقولّنا نبدأ منين.',
  ],
};

/** Introduces the bullet list of weak topics. */
export const FOCUS_INTROS = [
  'ركّز معايا في:',
  'النقط اللي عايزك تراجعها:',
  'الحتت اللي وقعت فيها:',
  'خد بالك من دول:',
  'اللي محتاج شغل:',
] as const;

/**
 * One bullet. `{topic}` is a category name from the question bank and
 * `{questions}` is an already-joined list of slot numbers.
 *
 * ⚠️ The QUESTION TEXT is deliberately not available here and must never be
 * added. A stem echoed into a chat message is readable without passing the
 * review window `AttemptService.review` resolves — so a student whose review
 * is closed would read their paper back out of the inbox. The topic name says
 * the useful half and leaks nothing.
 */
export const FOCUS_ITEM = '• {topic} — سؤال {questions}';

/** A bullet for a topic that has no category name recorded. */
export const FOCUS_ITEM_UNTITLED = '• سؤال {questions}';

/** Softens the list. Always follows it. */
export const FOCUS_TAILS = [
  'دول مش صعبين، بس بيتكرروا في الامتحان كتير.',
  'لو حاجة فيهم مش واضحة، ردّ عليّ هنا وأنا أشرحهالك بنفسي.',
  'مش عايزك تعدّي عليهم — دول اللي بيفرقوا الدرجة آخر السنة.',
  'ارجع للدرس في الحتت دي بالذات، مش من الأول.',
  'ذاكرهم النهارده وهما لسه طازة في دماغك.',
] as const;

/** Only when there IS something to praise. `{topics}` is a joined list. */
export const STRENGTH_LINES = [
  'وبالمناسبة، {topics} إنت ماسكها كويس — خليها كده.',
  'اللي عجبني إن {topics} جبتها كلها صح.',
  '{topics} تمام عندك، مفيش قلق منها.',
  'وعلى فكرة {topics} مفيش فيها غلطة واحدة.',
] as const;

/** Closes a result message. Band-specific, like the score line. */
export const QUIZ_CLOSERS: Record<OutreachBand, readonly string[]> = {
  excellent: [
    'اللي زيّك اللي بيكسر الامتحان. كمّل بنفس الروح دي.',
    'خليك على الشغل ده، وأنا معاك لحد آخر السنة.',
    'لو حبيت أسئلة أصعب من دي قولّي وأنا أجهّزهالك.',
    'متقفش هنا — اللي جاي أحلى.',
    'فخور بيك بجد. وأي حاجة تحتاجها أنا هنا.',
  ],
  strong: [
    'شوية تركيز في الحتة دي وإنت في التسعينات.',
    'أنا شايفك قريّب جداً. خلّينا نقفلهم مع بعض.',
    'راجع النقط دي وهتحس بالفرق في الكويز الجاي.',
    'إنت مش محتاج تذاكر أكتر، إنت محتاج تذاكر أدق.',
    'كمّل كده وأنا مطمّن عليك.',
  ],
  fair: [
    'ارجع للدرس تاني وشوف النقط دي، وبعدين كلّمني.',
    'متزعلش من الرقم — ده بيتغيّر في أسبوع لو ذاكرت صح.',
    'لو مش عارف تبدأ منين، ابعتلي هنا وأنا أرتّبهالك خطوة خطوة.',
    'أنا مش عايزك تحفظ، عايزك تفهم. تعالى نمشي فيهم سوا.',
    'الغلط في الكويز أرخص كتير من الغلط في الامتحان. استفيد منه.',
  ],
  weak: [
    'أنا مش هسيبك. اتفرّج على الدرس تاني، وأي حاجة مش واضحة اسألني هنا.',
    'اللي بيبدأ من تحت بيوصل — بس لازم نبدأ دلوقتي.',
    'ابعتلي هنا وقولّي تايه في إيه بالظبط، وأنا أشرحهولك بنفسي.',
    'مفيش سؤال غبي. اسألني في أي حاجة، بجد.',
    'أنا شفت طلبة بدأوا من هنا وخلّصوا السنة في الأوائل. الفرق إنهم سألوا.',
  ],
};

// ── the student who watched but never sat the quiz ─────────────────────

export const NUDGE_OPENERS = [
  'خلّصت «{lesson}» — برافو. بس فاضل حاجة واحدة.',
  'شايف إنك اتفرّجت على «{lesson}» كلها.',
  'عملت اللي عليك في «{lesson}»، بس الكويز لسه فاضي.',
  '«{lesson}» خلصت عندك، والكويز بتاعها مستنيك.',
  'اتفرّجت على «{lesson}» ومشيت من غير الكويز.',
] as const;

export const NUDGE_BODIES = [
  'الكويز مش عشان الدرجة — ده اللي بيقولّي، ويقولّك، إنت فهمت فعلاً ولا لأ.',
  'الفيديو بيدّيك المعلومة، والكويز هو اللي بيثبّتها. من غيره بتطير.',
  'بعد إذنك روح حلّه — عشان تكون استفدت ١٠٠٪، مش ٦٠٪.',
  'عشر دقايق بس، وهتعرف إنت واقف فين بالظبط.',
  'أنا مش هعرف أساعدك من غير ما أشوف إنت غلطت فين.',
] as const;

export const NUDGE_CLOSERS = [
  'يلا، وبعدها كلّمني بالنتيجة.',
  'لو سؤال فيهم صعب، اسألني هنا على طول.',
  'أنا مستني نتيجتك.',
  'وأي حاجة تعطّلك، أنا هنا.',
  'روح حلّه دلوقتي وإنت لسه فاكر.',
] as const;

// ── the student who finished a lesson that has no quiz ─────────────────

export const PRAISE_OPENERS = [
  'شفت إنك خلّصت «{lesson}». تمام كده.',
  '«{lesson}» خلصت — والله إنت ماشي كويس.',
  'متابعك في «{lesson}»، وشايف إنك مكمّل.',
  'خلّصت «{lesson}». حبيت أقولك إني بشوف.',
  'خلاص «{lesson}» بقت وراك.',
] as const;

export const PRAISE_BODIES = [
  'الاستمرار ده هو اللي بيفرق آخر السنة، مش المذاكرة المتقطعة.',
  'مش كل الطلبة بتكمّل. إنت كمّلت.',
  'اللي بيمشي كل يوم شوية بيوصل قبل اللي بيذاكر ليلة الامتحان.',
  'أنا بتابع مين بيكمّل ومين بيقف. إنت في الأولانيين.',
] as const;

export const PRAISE_CLOSERS = [
  'كمّل على كده، وأي حاجة تحتاجها أنا هنا.',
  'لو حبيت أرشّحلك اللي بعده، قولّي.',
  'يلا للي بعده.',
  'وأي سؤال في أي وقت، ابعتلي هنا.',
] as const;

// ── the WhatsApp group ─────────────────────────────────────────────────

/** As a standalone message. */
export const WHATSAPP_OPENERS = [
  'حاجة صغيّرة حبيت أقولهالك.',
  'مش رسالة مهمة، بس حبيت أفكّرك.',
  'سؤال سريع: إنت في جروب الواتساب؟',
  'بلاحظ إنك بتذاكر لوحدك.',
] as const;

export const WHATSAPP_BODIES = [
  'إحنا عاملين جروب واتساب للطلبة: تنبيهات المواعيد، حلول الأسئلة، والمراجعات أول بأول.',
  'في جروب واتساب بنتكلم فيه كل يوم — أسئلة وحلول وأي جديد بينزل.',
  'الجروب على واتساب هو أسرع طريقة توصلني، وتوصل باقي الطلبة.',
  'الطلبة في الجروب بيساعدوا بعض، وأنا بردّ هناك على طول.',
] as const;

export const WHATSAPP_CLOSERS = [
  'ادخل معانا، مش هتخسر حاجة.',
  'لينك الجروب تحت. شوفك هناك.',
  'ولو مش عايز، عادي جداً — بس حبيت تعرف إنه موجود.',
  'دوس على اللينك وإنت معانا.',
] as const;

/**
 * Appended to a message that is mainly about something else.
 *
 * Separate from `WHATSAPP_BODIES` on purpose: this one has to read as an
 * afterthought, because it IS one. The standalone pool above reads as the
 * point of the message, which it also is.
 */
export const WHATSAPP_TAGALONGS = [
  'ونصيحة: لو لسه مدخلتش جروب الواتساب، ادخل — بننزل فيه تنبيهات وحلول أول بأول.',
  'وبعدين، جروب الواتساب لسه مستنيك. أغلب الأسئلة بتتحل هناك في دقايق.',
  'آه، وافتكر تدخل جروب الواتساب — بنتكلم فيه كل يوم.',
  'ولو مش في جروب الواتساب، ادخل بقى — إنت بتفوّت حاجات.',
] as const;

/** The link, on its own line, when there is one to give. */
export const WHATSAPP_LINK_LINE = 'لينك الجروب: {url}';

/**
 * How several topic names are joined inside one sentence.
 *
 * Arabic joins the last item with «و» and NOT with a comma before it, which is
 * why this cannot be `Intl.ListFormat('ar')`'s default — and why it is copy
 * rather than punctuation baked into the composer.
 */
export const LIST_SEPARATOR = '، ';
export const LIST_LAST_SEPARATOR = ' و';

/** Joins slot numbers inside one bullet: «سؤال 3 و 7». */
export const QUESTION_NUMBER_SEPARATOR = ' و ';
