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
 * ## Three rules every line here obeys
 *
 * **1. Spoken Egyptian, not written Arabic.** Short sentences, ordinary words,
 * and no aphorisms. The first draft was full of lines like «الغلط في الكويز
 * أرخص كتير من الغلط في الامتحان» and «إنت مش محتاج تذاكر أكتر، إنت محتاج
 * تذاكر أدق» — clever, and reported back as «الكلام اللي اتكتب مش مفهوم أوي».
 * A fifteen-year-old reading a message on a phone should not have to parse a
 * metaphor. If a line cannot be said out loud to a student's face, it does not
 * belong here.
 *
 * **2. The work always sounds SMALL.** Every `FOCUS_TAILS` entry, and every
 * score line in the two lower bands, says in plain words that what is left is
 * easy, short, or simple to explain. That is not decoration: a student who
 * reads «إنت ضعيف في الحلقات المتداخلة» and nothing else closes the message
 * and does nothing. «دول سهلين، ربع ساعة وخلاص» is what makes them open the
 * lesson. The reassurance is the point of the message, not a softener on it.
 *
 * **3. He is «مهندس أيمن».** Not «أيمن». The title is how his students address
 * him everywhere else on the platform, and a message signed with the bare
 * first name reads like it came from a system that only has a database column.
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
  'إزيك يا {name}، أنا مهندس أيمن',
  'صباح الفل يا {name}',
  'يا {name}، إزيك؟',
  '{name}، إزي حالك؟',
] as const;

/**
 * «شفت نتيجتك» — the line that says he looked.
 *
 * Every entry is in the first person and every entry implies an act of
 * looking, because that is the entire message under the message.
 *
 * ⚠️ EVERY entry must carry `{quiz}`, and `compose.spec.ts` fails the build if
 * one does not. The first draft had an opener that named no paper, and the
 * rest of the message never names one either: the score line is a bare number
 * and the bullets name TOPICS. A student who sat three papers that week could
 * not tell which one it was about, and one message in six was like that. It
 * survived local runs and only failed in CI, because which opener is drawn
 * depends on a seed built from ids that differ every run.
 */
export const QUIZ_RESULT_OPENERS = [
  'كنت بشوف نتايج «{quiz}» النهاردة، ووقفت عند بتاعك.',
  'شفت نتيجتك في «{quiz}».',
  'خلّصت تصحيح «{quiz}»، وشفت ورقتك.',
  'بصّيت على ورقتك في «{quiz}» من شوية.',
  'نتيجتك في «{quiz}» طلعت، وأنا شفتها.',
  'قريت ورقتك في «{quiz}» دلوقتي.',
] as const;

/**
 * The verdict on the number. Chosen by band — see the header.
 *
 * The two lower bands carry the reassurance in the SCORE LINE itself, not just
 * in the tail after the bullets. A student who reads a small number stops
 * reading right there, so the sentence that delivers the number has to be the
 * one that says it is fixable.
 */
export const QUIZ_SCORE_LINES: Record<OutreachBand, readonly string[]> = {
  excellent: [
    '{score}٪. ده رقم كبير، وإنت تستاهله.',
    '{score}٪ — شغل ممتاز بجد.',
    '{score}٪. واضح إنك ذاكرت كويس.',
    'جبت {score}٪، وده مش سهل.',
    '{score}٪. أنا مبسوط منك.',
  ],
  strong: [
    '{score}٪ — رقم حلو، وقريّب من الكامل.',
    '{score}٪. إنت فاهم، فاضل حاجات صغيرة بس.',
    '{score}٪، يعني الأساس عندك تمام.',
    '{score}٪ — كويس، وتقدر تجيب أكتر.',
    'جبت {score}٪. ناقصك حاجتين بسيطين وخلاص.',
  ],
  fair: [
    '{score}٪. كويس، وفاضل حتة أو اتنين بسيطين بس.',
    '{score}٪ — عملت نص الطريق، والباقي أسهل.',
    '{score}٪. الرقم ده بيتظبط بسرعة، متقلقش.',
    '{score}٪. مفيش مشكلة، أنا عارف ناقصك إيه بالظبط.',
    'جبت {score}٪، والحاجات اللي ناقصاك بسيطة.',
  ],
  weak: [
    '{score}٪. الرقم صغير، بس صدّقني الحكاية أسهل ما إنت فاكر.',
    '{score}٪ — الدرس عدّى عليك بسرعة، وده بيحصل. نرجعله تاني وهتلاقيه أسهل.',
    '{score}٪. متضايقش، هنبدأ من الأول وهتلاقيها سهلة.',
    '{score}٪. مفيش مشكلة خالص، ده أول الطريق.',
    'جبت {score}٪. الحاجات دي مش صعبة، بس محتاجة حد يشرحهالك تاني.',
  ],
};

/** Introduces the bullet list of weak topics. */
export const FOCUS_INTROS = [
  'ركّز معايا في الحاجات دي:',
  'اللي عايزك تراجعه:',
  'الحاجات اللي غلطت فيها:',
  'خد بالك من دول:',
  'دي الحتت اللي محتاجة مراجعة:',
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

/**
 * Always follows the bullets, and EVERY entry says the work is small.
 *
 * This is the most load-bearing pool in the file. A list of topics a student
 * got wrong, delivered on its own, is a list of reasons to feel stupid and
 * close the app. The line under it is what turns the same list into something
 * worth opening the lesson for — so "it is easy", "it is short", or "I will
 * explain it myself" is not optional in any of these, and a new entry that
 * lacks it does not belong in the pool.
 */
export const FOCUS_TAILS = [
  'دول سهلين والله. ربع ساعة مراجعة وهتبقى ماسكهم.',
  'متخافش منهم، دول من أسهل الحاجات في الدرس.',
  'صدّقني مش صعبين — ارجع للدرس تاني وهتفهمهم على طول.',
  'شرحهم بسيط جداً. لو حابب أشرحهملك تاني، ابعتلي هنا.',
  'الحاجات دي مالهاش لزوم حفظ — بسيطة، تفهمها مرة واحدة وتخلص منها.',
] as const;

/** Only when there IS something to praise. `{topics}` is a joined list. */
export const STRENGTH_LINES = [
  'وعلى فكرة {topics} ماسكها كويس، خليك كده.',
  'اللي عجبني إن {topics} جبتها كلها صح.',
  '{topics} تمام عندك، متقلقش منها.',
  'و{topics} مفيش فيها ولا غلطة واحدة.',
] as const;

/** Closes a result message. Band-specific, like the score line. */
export const QUIZ_CLOSERS: Record<OutreachBand, readonly string[]> = {
  excellent: [
    'كمّل كده، إنت ماشي صح.',
    'لو عايز أسئلة أصعب شوية قولّي وأنا أبعتلك.',
    'متقفش هنا، اللي جاي أحلى.',
    'أنا فخور بيك. أي حاجة تحتاجها أنا موجود.',
    'خليك على المستوى ده لآخر السنة.',
  ],
  strong: [
    'راجع الحاجات دي وهتلاقي الفرق في الكويز اللي بعده.',
    'إنت قريّب جداً. خلينا نخلّص الحتت دي مع بعض.',
    'شوية تركيز بس وهتبقى في التسعينات.',
    'لو حاجة مش واضحة، اسألني هنا وأنا أشرحهالك.',
    'كمّل كده وأنا مطمّن عليك.',
  ],
  fair: [
    'ارجع للدرس في الحتت دي بس، وبعدين قولّي.',
    'متزعلش من الرقم. أسبوع مذاكرة صح وهيتغيّر.',
    'لو مش عارف تبدأ منين، ابعتلي وأنا أرتّبهالك بالترتيب.',
    'أنا مش عايزك تحفظ، عايزك تفهم — والفهم هنا سهل.',
    'اسألني في أي حاجة، مفيش سؤال بايخ.',
  ],
  weak: [
    'أنا مش هسيبك. اتفرّج على الدرس تاني، وأي حاجة مش واضحة اسألني.',
    'ابعتلي وقولّي مش فاهم إيه بالظبط، وأنا أشرحهولك بنفسي.',
    'خد الحاجات دي واحدة واحدة، هتلاقيها أسهل ما إنت متخيّل.',
    'اسألني في أي حاجة، بجد. مفيش سؤال بايخ.',
    'أنا شفت ناس بدأت زيك بالظبط وبقت من الأوائل. الفرق إنهم سألوا.',
  ],
};

// ── the student who watched but never sat the quiz ─────────────────────

export const NUDGE_OPENERS = [
  'خلّصت «{lesson}» — تمام. فاضل حاجة واحدة بس.',
  'شفت إنك اتفرّجت على «{lesson}» كلها.',
  '«{lesson}» خلصت، والكويز بتاعها لسه مستنيك.',
  'اتفرّجت على «{lesson}» ومشيت من غير ما تحل الكويز.',
  'عملت اللي عليك في «{lesson}»، بس الكويز لسه فاضي.',
] as const;

export const NUDGE_BODIES = [
  'الكويز ده سهل والله، عشر دقايق وخلاص.',
  'حلّه عشان أعرف إنت فهمت ولا لأ — وعشان تعرف إنت كمان.',
  'الفيديو بيدّيك المعلومة، والكويز هو اللي بيثبّتها في دماغك.',
  'بعد إذنك روح حلّه، عشان تكون استفدت من الدرس ١٠٠٪.',
  'مش عايز منك غير عشر دقايق، وهتفرق معاك كتير.',
] as const;

export const NUDGE_CLOSERS = [
  'يلا، وبعدها قولّي جبت كام.',
  'لو سؤال فيهم صعب، اسألني هنا على طول.',
  'أنا مستني نتيجتك.',
  'أي حاجة تعطّلك، أنا موجود.',
  'روح حلّه دلوقتي وإنت لسه فاكر الدرس.',
] as const;

// ── the student who finished a lesson that has no quiz ─────────────────

export const PRAISE_OPENERS = [
  'شفت إنك خلّصت «{lesson}». تمام كده.',
  '«{lesson}» خلصت — إنت ماشي كويس والله.',
  'متابعك، وشايف إنك خلّصت «{lesson}».',
  'خلّصت «{lesson}». حبيت أقولك إني بشوف.',
  '«{lesson}» بقت وراك خلاص.',
] as const;

export const PRAISE_BODIES = [
  'اللي بيذاكر كل يوم شوية بيوصل قبل اللي بيذاكر ليلة الامتحان.',
  'مش كل الطلبة بتكمّل، وإنت كمّلت.',
  'أنا بتابع مين بيكمّل ومين بيقف، وإنت في الأولانيين.',
  'كده إنت ماشي بانتظام، وده أهم حاجة.',
] as const;

export const PRAISE_CLOSERS = [
  'كمّل كده، وأي حاجة تحتاجها أنا موجود.',
  'لو عايز أقولك تذاكر إيه بعده، ابعتلي.',
  'يلا للدرس اللي بعده.',
  'أي سؤال في أي وقت، ابعتلي هنا.',
] as const;

// ── the WhatsApp channel ───────────────────────────────────────────────
//
// THE CHANNEL, not the group — and the difference decides what these lines
// are allowed to promise. A channel is broadcast: he posts, nobody replies.
// So none of this may say «بنتكلم فيه كل يوم» or «الطلبة بيساعدوا بعض»,
// which is what the first draft said about a group whose link was never
// configured — so the invitation had no link to give and was never sent at
// all. What the channel actually is, is where the MATERIAL lands: the files,
// the summaries, the revisions, and the notice that any of it went up.
//
// Short, too. This is the one message that arrives unprompted about nothing
// the student did, so it gets three lines and gets out of the way.

/** As a standalone message. */
export const WHATSAPP_OPENERS = [
  'حاجة صغيرة وهسيبك.',
  'سؤال سريع: إنت مشترك في قناة الواتساب؟',
  'مش عايز حاجة، بس حبيت أفكّرك.',
  'شايفك بتذاكر لوحدك، وده مش لازم.',
] as const;

export const WHATSAPP_BODIES = [
  'أنا بنزّل على قناة الواتساب كل المادة: الملخصات والملفات والمراجعات، وأي جديد أول ما ينزل.',
  'كل الملفات والمذكرات بترفع على القناة، وأي تنبيه بميعاد امتحان بينزل هناك.',
  'القناة فيها كل الماتريال — ملخصات وملفات ومراجعات قبل الامتحانات.',
  'بحط على القناة كل حاجة تنفعك في المذاكرة، وبتوصلك على طول من غير ما تفتح المنصة.',
] as const;

export const WHATSAPP_CLOSERS = [
  'اشترك من اللينك ده، وهيوصلك كل حاجة أول بأول.',
  'دوس على اللينك وإنت مشترك.',
  'اشترك بس، مش هتخسر حاجة.',
  'اللينك تحت، مش هياخد منك دقيقة.',
] as const;

/**
 * Appended to a message that is mainly about something else.
 *
 * Separate from `WHATSAPP_BODIES` on purpose: this one has to read as an
 * afterthought, because it IS one. The standalone pool above reads as the
 * point of the message, which it also is.
 */
export const WHATSAPP_TAGALONGS = [
  'وبالمناسبة، لو لسه مش مشترك في قناة الواتساب — بنزّل عليها كل الملفات والمراجعات أول بأول.',
  'وافتكر تشترك في قناة الواتساب، كل الماتريال بينزل هناك.',
  'ولو مش مشترك في القناة، اشترك — بيفوتك ملفات ومراجعات.',
  'وقناة الواتساب فيها كل الملخصات والملفات، لو لسه مشتركتش.',
] as const;

/** The link, on its own line, when there is one to give. */
/**
 * The link, ALONE on its own line.
 *
 * ⚠️ The «لينك القناة:» label used to be on this line and had to go, because
 * the renderer keys off the line being NOTHING BUT A URL: `MessageBody` turns
 * such a line into a pressable WhatsApp card and drops the raw address. With a
 * label glued to the front there is no clean line to replace, and what shipped
 * was the raw URL inline in a chat bubble — 55 unbreakable characters in a box
 * about 280px wide, so it ran off the side of the panel and could not be
 * tapped. The closers already say «اللينك تحت»; the label was saying it twice
 * and costing the card.
 */
export const WHATSAPP_LINK_LINE = '{url}';

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
