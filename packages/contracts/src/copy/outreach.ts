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
 * **4. Nothing here knows whether it is talking to a boy or a girl.** The
 * platform never asks, so every line that inflected — «عامل إيه»، «إنت فاهم»،
 * «متقلقش»، «راجع الحاجات دي» — was addressing a male student and telling
 * every female one that the message was not written for her. Arabic makes
 * that hard to avoid by accident, so the pools are written with four devices
 * and it is worth naming them:
 *
 *   · **first person.** «شفت ورقتك»، «أنا أشرحهالك»، «أنا مطمّن» — he inflects
 *     for himself, which is a fact the platform actually knows.
 *   · **the inclusive plural.** «خلينا نخلّصها مع بعض»، «نرجعله تاني» — this
 *     is also the warmest form in the file, so it costs nothing.
 *   · **nominal sentences instead of imperatives.** Not «راجع الحاجات دي» but
 *     «مراجعة صغيرة للحاجات دي»; not «متقلقش» but «ملوش لزوم قلق».
 *   · **the suffix ـك on a noun.** «نتيجتك»، «ورقتك»، «عندك»، «ناقصك»،
 *     «أشرحهالك» are one spelling for both readings. «معاك»، «وراك»، «بيك»
 *     are NOT — those grow a ي in the feminine and are banned.
 *
 * `compose.spec.ts` carries a tripwire over this pool: a short list of forms
 * that can only be said to a male reader, checked token by token. It cannot
 * prove a sentence is neutral — that is what this note is for — but it catches
 * every form that has actually shipped.
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
 *
 * Two entries that were here are gone and both for reasons worth keeping:
 *
 *   · «{name}، عامل إيه؟» — «عامل» is masculine. «إزيك»، «إزي حالك» and
 *     «أخبارك إيه» are the same spelling whoever is reading, which is why the
 *     pool now leans on them.
 *   · «صباح الفل يا {name}» — the sweeper sends at whatever hour a paper was
 *     graded, and one of these landed at 1:00 ص. A greeting that names the
 *     time of day is a greeting that is sometimes simply wrong.
 */
export const OUTREACH_GREETINGS = [
  'إزيك يا {name} 👋',
  'أهلاً يا {name}',
  'السلام عليكم ورحمة الله وبركاته يا {name}، أخبارك إيه؟',
  'إزيك يا {name}، أنا مهندس أيمن',
  '{name}، أخبارك إيه؟',
  'يا {name}، إزيك؟',
  '{name}، إزي حالك؟',
  'سلام عليكم يا {name}، أخبار المذاكرة إيه؟',
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
    '{score}٪. ده رقم كبير، ومحدش بياخده بالصدفة.',
    '{score}٪ — شغل ممتاز بجد.',
    '{score}٪. واضح إن المذاكرة كانت بجد.',
    'النتيجة {score}٪، وده مش سهل.',
    '{score}٪. أنا مبسوط بالنتيجة دي بجد.',
  ],
  strong: [
    '{score}٪ — رقم حلو، وقريّب من الكامل.',
    '{score}٪. الأساس مظبوط، فاضل حاجات صغيرة بس.',
    '{score}٪، يعني الأساس عندك تمام.',
    '{score}٪ — كويس، والرقم ده يقبل الزيادة.',
    '{score}٪. ناقصك حاجتين بسيطين وخلاص.',
  ],
  fair: [
    '{score}٪. كويس، وفاضل حتة أو اتنين بسيطين بس.',
    '{score}٪ — نص الطريق خلص، والباقي أسهل.',
    '{score}٪. الرقم ده بيتظبط بسرعة، وملوش لزوم قلق.',
    '{score}٪. مفيش مشكلة، أنا عارف ناقصك إيه بالظبط.',
    'النتيجة {score}٪، والحاجات الناقصة بسيطة.',
  ],
  weak: [
    '{score}٪. الرقم صغير، بس الحكاية أسهل بكتير من شكلها.',
    '{score}٪ — الدرس عدّى بسرعة، وده بيحصل. نرجعله تاني وهنلاقيه أسهل.',
    '{score}٪. الزعل مش هيفيد في حاجة — هنبدأ من الأول، والمرة دي أسهل.',
    '{score}٪. مفيش مشكلة خالص، ده أول الطريق.',
    '{score}٪. الحاجات دي مش صعبة، بس محتاجة حد يشرحهالك تاني.',
  ],
};

/** Introduces the bullet list of weak topics. */
export const FOCUS_INTROS = [
  'دي الحتت اللي محتاجة مراجعة:',
  'الحاجات اللي هنشتغل عليها مع بعض:',
  'الغلطات اللي في الورقة، وكلها بسيطة:',
  'محتاجين وقفة صغيرة عند دول:',
  'النقط اللي أنا واقف عندها:',
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

/**
 * ONE mistake, said in one line.
 *
 * ⚠️ Every entry here has to do three jobs in a single sentence, because it
 * replaces four lines that used to do them separately: name what went wrong,
 * say it is small, and leave the door open. The version it replaces was a
 * heading, a bullet, and a reassurance under it — five paragraphs for a 93%
 * paper with one slip, and the student it was sent to answered «يعني اي».
 *
 * ⚠️ NOTHING HERE MAY BE GENDERED. «راجع» and «راجعي» are both wrong; the
 * verbal noun («مراجعة») and the first person («أشرحها», «أنا موجود») are what
 * work for a reader the platform never asked about. Same rule as the top of
 * this file.
 */
export const FOCUS_SINGLE = [
  'غلطة واحدة بس، في {topic} — وهي من السهل خالص.',
  'فيه غلطة واحدة، {topic}. مراجعة سريعة وتخلص.',
  'الغلطة الوحيدة كانت في {topic}، وهي بسيطة.',
  'ماعدا غلطة واحدة في {topic} — دقيقة مراجعة مش أكتر.',
  'غلطة واحدة في {topic}. ولو مش واضحة، أنا أشرحها.',
] as const;

/** The topic, when its name says something the opener did not. */
export const FOCUS_SINGLE_NAMED = '{topic} (سؤال {questions})';

/** …and when it does not — the question number is what a student acts on. */
export const FOCUS_SINGLE_PLAIN = 'سؤال {questions}';

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
  'دول سهلين والله. ربع ساعة مراجعة وخلاص.',
  'مفيش فيهم حاجة تخوّف، دول من أسهل الحاجات في الدرس.',
  'والله مش صعبين — رجعة واحدة للدرس وتخلص الحكاية.',
  'شرحهم بسيط جداً، ولو فيه حاجة مش واضحة أنا هنا وأشرحها تاني.',
  'الحاجات دي مالهاش لزوم حفظ — بسيطة، وبتتفهم مرة واحدة وتخلص.',
] as const;

/** Only when there IS something to praise. `{topics}` is a joined list. */
export const STRENGTH_LINES = [
  'وعلى فكرة {topics} مظبوطة تمام، وده اللي عجبني.',
  'اللي عجبني إن {topics} كلها صح.',
  '{topics} تمام عندك، وملهاش لزوم مراجعة.',
  'و{topics} مفيش فيها ولا غلطة واحدة.',
] as const;

/** Closes a result message. Band-specific, like the score line. */
export const QUIZ_CLOSERS: Record<OutreachBand, readonly string[]> = {
  excellent: [
    'الطريق ده صح، ونكمّل عليه.',
    'عندي أسئلة أصعب شوية، ولو فيه استعداد أبعتها هنا.',
    'الوقفة مش هنا — اللي جاي أحلى.',
    'أنا فخور بالشغل ده. وأي حاجة، أنا موجود.',
    'المستوى ده يستاهل يكمّل لآخر السنة.',
  ],
  strong: [
    'مراجعة صغيرة للحاجات دي، والفرق هيبان في الكويز اللي بعده.',
    'باقي حتة صغيرة، وخلينا نخلّصها مع بعض.',
    'شوية تركيز بس، والتسعينات قريبة.',
    'أي حاجة مش واضحة، السؤال هنا وأنا أشرحهالك.',
    'أنا مطمّن، والباقي شغل بسيط.',
  ],
  fair: [
    'رجعة للدرس في الحتت دي بس، وبعدها نتكلم.',
    'الرقم ده ملوش لزوم زعل. أسبوع مذاكرة صح وهيتغيّر.',
    'ولو البداية مش واضحة، رسالة هنا وأنا أرتّبهالك الحاجات بالترتيب.',
    'أنا مش عايز حفظ، أنا عايز فهم — والفهم هنا سهل.',
    'أي سؤال في أي وقت، ومفيش سؤال بايخ.',
  ],
  weak: [
    'أنا مش هسيبك. فرجة تانية على الدرس، وأي حاجة مش واضحة أنا هنا.',
    'رسالة هنا بالحاجة اللي مش واضحة، وأنا أشرحهالك بنفسي.',
    'الحاجات دي واحدة واحدة، وهتطلع أسهل بكتير من شكلها.',
    'أي سؤال، بجد أي سؤال — مفيش حاجة اسمها سؤال بايخ.',
    'أنا شفت ناس بدأت زيك بالظبط وبقت من الأوائل. الفرق إنهم سألوا.',
  ],
};

// ── the student who watched but never sat the quiz ─────────────────────

export const NUDGE_OPENERS = [
  '«{lesson}» خلصت — تمام. فاضل حاجة واحدة بس.',
  'متابعك من بعيد، و«{lesson}» خلصت كلها.',
  '«{lesson}» خلصت، والكويز بتاعها لسه مستنيك.',
  'درس «{lesson}» عدّى، والكويز لسه من غير حل.',
  'كل حاجة في «{lesson}» اتعملت، بس الكويز لسه فاضي.',
] as const;

export const NUDGE_BODIES = [
  'الكويز ده سهل والله، عشر دقايق وخلاص.',
  'من غير الكويز مش هعرف المعلومة وصلت ولا لأ.',
  'الفيديو بيوصّل المعلومة، والكويز هو اللي بيثبّتها.',
  'بعد إذنك، عشر دقايق للكويز والدرس يبقى اتقفل ١٠٠٪.',
  'مش عايز غير عشر دقايق، وفرقهم كبير.',
] as const;

export const NUDGE_CLOSERS = [
  'يلا، وبعدها نتكلم في النتيجة.',
  'أي سؤال فيهم صعب، أنا هنا على طول.',
  'أنا مستني نتيجتك.',
  'أي حاجة تعطّلك، أنا موجود.',
  'أحسن وقت للكويز دلوقتي، والدرس لسه طازة.',
] as const;

// ── the student who finished a lesson that has no quiz ─────────────────

export const PRAISE_OPENERS = [
  'شفت إن «{lesson}» خلصت. تمام كده.',
  '«{lesson}» خلصت — والانتظام ده كويس والله.',
  'متابعك، وشايف إن «{lesson}» خلصت.',
  '«{lesson}» خلصت، وحبيت أقولك إني بشوف.',
  '«{lesson}» بقت في الجيب خلاص.',
] as const;

export const PRAISE_BODIES = [
  'اللي بيذاكر كل يوم شوية بيوصل قبل اللي بيذاكر ليلة الامتحان.',
  'مش كل الطلبة بتكمّل الدرس لآخره، وده حصل هنا.',
  'أنا بتابع مين بيكمّل ومين بيقف، وإنت في الأولانيين.',
  'الانتظام ده أهم حاجة في السنة كلها.',
] as const;

export const PRAISE_CLOSERS = [
  'نكمّل كده، وأي حاجة أنا موجود.',
  'ولو فيه سؤال عن اللي بعده، أنا أرتّبه هنا.',
  'يلا للدرس اللي بعده.',
  'الباب مفتوح لأي سؤال في أي وقت.',
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
  'سؤال سريع: الاشتراك في قناة الواتساب تم ولا لسه؟',
  'مش عايز حاجة، بس حبيت أفكّرك.',
  'المذاكرة لوحدها صعبة، وأنا حاطط كل حاجة في مكان واحد.',
] as const;

export const WHATSAPP_BODIES = [
  'أنا بنزّل على قناة الواتساب كل المادة: الملخصات والملفات والمراجعات، وأي جديد أول ما ينزل.',
  'كل الملفات والمذكرات بترفع على القناة، وأي تنبيه بميعاد امتحان بينزل هناك.',
  'القناة فيها كل الماتريال — ملخصات وملفات ومراجعات قبل الامتحانات.',
  'بحط على القناة كل حاجة تنفع في المذاكرة، وبتوصل على طول من غير ما حد يفتح المنصة.',
] as const;

/**
 * The last line, and it comes AFTER the card — see `composeOutreach`, which
 * puts the link line at the end of the previous block.
 *
 * So it points UP at something the student can see: «الزرار الأخضر اللي فوق»
 * is the green button `MessageBody` draws inside the card, and naming it is
 * the whole job of this pool. What it used to say instead was «اشترك بس، مش
 * هتخسر حاجة» — an argument for pressing rather than an instruction to press,
 * and one that plants «هتخسر» in a message about a free channel. Nobody needs
 * persuading at line four; they need to be told which shape to hit.
 */
export const WHATSAPP_CLOSERS = [
  'الزرار الأخضر اللي فوق بيفتح القناة — دوسة واحدة وخلاص.',
  'دوسة واحدة على الزرار الأخضر ده، والقناة تفتح على طول.',
  'الدخول من الزرار الأخضر اللي فوق، وبعدها كل جديد بيوصل لوحده.',
  'الزرار الأخضر ده هو باب القناة، وثانية واحدة تفصلك عنها.',
] as const;

/**
 * Appended to a message that is mainly about something else.
 *
 * Separate from `WHATSAPP_BODIES` on purpose: this one has to read as an
 * afterthought, because it IS one. The standalone pool above reads as the
 * point of the message, which it also is.
 */
export const WHATSAPP_TAGALONGS = [
  'وبالمناسبة، لو الاشتراك في قناة الواتساب لسه ماحصلش — بنزّل عليها كل الملفات والمراجعات أول بأول.',
  'وقناة الواتساب مستنية، كل الماتريال بينزل هناك أول بأول.',
  'ومن غير القناة بيفوتك ملفات ومراجعات كتير.',
  'وقناة الواتساب فيها كل الملخصات والملفات، والاشتراك فيها ثانية واحدة.',
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
