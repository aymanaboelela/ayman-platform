import { copy } from '@ayman/contracts/copy';
import {
  ASSISTANT_NODES,
  ASSISTANT_ROOT,
  isNextChoice,
  type AssistantNodeId,
} from '@ayman/contracts/assistant/script';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import type { AssistantFacts, BookFact, CourseFact } from './assistant-facts.service';

/**
 * Everything المساعد is allowed to know, in one place.
 *
 * ## The corpus is DERIVED, never re-typed
 *
 * Every answer the guided tree gives is already a paragraph a human wrote on
 * purpose — «الكويزات القصيرة اختيار من متعدد…», «كل كورس متقسّم وحدات…». Those
 * paragraphs ARE the knowledge base. Re-typing them into a prompt would create
 * a second copy that goes stale the first time the instructor re-words a node,
 * and nothing would fail: the tree would say one thing and the chat another,
 * to the same student, on the same screen.
 *
 * So `knowledgeEntries()` walks `ASSISTANT_NODES` and reads
 * `copy.assistant.script`. Re-wording a node re-words the chat. Adding a node
 * teaches the chat. There is no second list to remember.
 *
 * ## The QUESTION for each entry is the CHOICE that leads to it
 *
 * Same relation `lib/assistant-path.ts` uses on the web side, and for the same
 * reason: a node's body is an answer, and the button pressed to reach it is
 * the short question that answer answers. That pairing is what makes the
 * corpus retrievable — by a model reading it, and by `matchKnowledge` below
 * when there is no model to read it.
 *
 * ## What is NOT here, deliberately
 *
 * Dates, offers, and anything about a specific student. The first changes
 * without anyone touching this repo, and the second is not knowledge, it is a
 * database read this module has no session to authorise. Both roads end at the
 * same place: «أوصّلك لأيمن».
 *
 * ## PRICES are not here either — and that is now a statement about SHAPE
 *
 * This block used to list prices beside dates as a thing المساعد may not say,
 * because «الأسعار بتتغيّر من فترة للتانية» and a number typed into a prompt
 * goes wrong in silence. That reasoning was never about prices being
 * unspeakable; it was about them being unWRITEABLE — a figure committed to
 * this file is a figure that outlives the admin form that set it.
 *
 * So there is still not one price anywhere in this repo, and there never will
 * be. What changed is that `AssistantFactsService` reads them off the rows at
 * answer time and `pricingBlock()` below renders that snapshot, per request,
 * OUTSIDE the cached system prefix. A price المساعد states was in Postgres at
 * most a minute earlier, and when it could not be read, `pricingBlock(null)`
 * forbids stating any number at all rather than reaching for a remembered one.
 * Read that service's docblock before touching either.
 */

/** One fact المساعد may answer from. */
export interface KnowledgeEntry {
  readonly id: string;
  /** The short form of what someone would be asking. */
  readonly question: string;
  /** The written answer, verbatim. */
  readonly answer: string;
}

/**
 * The written corpus — everything المساعد knows that the TREE does not say.
 *
 * `copy.assistant.knowledge` is where it lives, beside every other string a
 * student reads, and its own comment carries the two rules that govern it:
 * nothing gendered, and nothing guessed. Two dozen entries covering the
 * questions the five-button menu never had room for — «إزاي أدخل المنصة؟»,
 * «نسيت كلمة السر», «الدرس مش بيفتح», «مش عندي إيميل».
 */
function writtenFacts(): KnowledgeEntry[] {
  return copy.assistant.knowledge.map((entry) => ({
    id: entry.id,
    question: entry.q,
    answer: entry.a,
  }));
}

/**
 * Facts about the platform ITSELF, which neither the tree nor the written
 * corpus states because every one of them assumes it.
 *
 * A student who types «انتوا بتدرّسوا إيه؟» is asking the one question no node
 * answers — the tree starts from "you already know where you are". Sourced
 * from `copy.site`, so the subject line and the instructor's name stay in the
 * one place that already owns them.
 */
function platformFacts(): KnowledgeEntry[] {
  return [
    {
      id: 'platform',
      question: 'المنصة دي بتاعة إيه؟',
      answer:
        `${copy.site.platformName} — ${copy.site.tagline}. المدرّس هو ${copy.site.instructor}، ` +
        'وكل الكورسات والامتحانات والمتابعة بتحصل من على المنصة نفسها.',
    },
    {
      id: 'human',
      question: 'أقدر أكلّم حد؟',
      answer:
        'أيوة. من زرار «أكلّم م. أيمن» اللي تحت خالص في المساعد — السؤال بيوصله هو شخصياً، ' +
        'والرد بيرجع في نفس المكان ومعاه إشعار. وفيه كمان قناة واتساب للملفات والمراجعات.',
    },
    {
      id: 'assistantItself',
      question: 'إنت مين؟',
      answer:
        'أنا مساعد المنصة — رد آلي بيجاوب من نفس المعلومات المكتوبة في المنصة. ' +
        'مش أيمن، ولما السؤال يبقى محتاجه بوصّله ليه على طول.',
    },
  ];
}

/** The written answers, straight out of the guided tree. */
function scriptEntries(): KnowledgeEntry[] {
  const questionFor = new Map<AssistantNodeId, string>();
  for (const id of Object.keys(ASSISTANT_NODES) as AssistantNodeId[]) {
    for (const choice of ASSISTANT_NODES[id].choices) {
      if (isNextChoice(choice)) questionFor.set(choice.next, copy.assistant.choices[choice.id]);
    }
  }

  const entries: KnowledgeEntry[] = [];
  for (const id of Object.keys(ASSISTANT_NODES) as AssistantNodeId[]) {
    /*
     * The root and the four category nodes are prompts, not answers —
     * «تمام. السؤال عن الكورسات في إيه بالظبط؟» is a menu label with no fact
     * in it, and feeding it to a model as knowledge teaches it to answer a
     * question with a question.
     *
     * The test is structural rather than a hand-kept list, so a branch added
     * next year classifies itself: a node that offers TWO OR MORE onward stops
     * is a fork. «رجوع» does not count — it is on nearly every node, and
     * counting it would classify `studyQuizzes` (one real paragraph, one way
     * back) as a menu and drop the platform's answer about its own exams.
     */
    if (id === ASSISTANT_ROOT) continue;
    const onward = ASSISTANT_NODES[id].choices.filter(
      (choice) => isNextChoice(choice) && choice.id !== 'back',
    );
    if (onward.length >= 2) continue;

    entries.push({
      id,
      question: questionFor.get(id) ?? copy.assistant.title,
      answer: copy.assistant.script[id],
    });
  }
  return entries;
}

/**
 * The whole corpus, built once at module load — nothing here reads a request.
 *
 * Three sources, and the order is the order a reader should meet them:
 * what the platform IS, the answers a human wrote into the guided tree, and
 * the written corpus that covers everything the tree had no button for.
 */
export const KNOWLEDGE: readonly KnowledgeEntry[] = [
  ...platformFacts(),
  ...scriptEntries(),
  ...writtenFacts(),
];

/**
 * The corpus as the model reads it.
 *
 * Byte-stable across every request, which is what lets the caller mark it
 * `cache_control: ephemeral` and stop paying for it on the second question of
 * the day. Anything that varies — the catalog, the student's own question —
 * has to go AFTER this block or the cache never hits. See the service.
 */
export function knowledgeBlock(): string {
  return KNOWLEDGE.map((entry) => `س: ${entry.question}\nج: ${entry.answer}`).join('\n\n');
}

/**
 * The published catalog, as a few lines the model can quote.
 *
 * Only what `GET /api/catalog/courses` already serves to anyone — titles,
 * subjects, lesson counts. No prices (the wire has none), no drafts (the query
 * has none), no student data (this module never sees a session).
 */
export function catalogBlock(courses: readonly CatalogCourse[]): string {
  if (courses.length === 0) return 'الكورسات المفتوحة دلوقتي: مفيش كورس منشور في اللحظة دي.';

  const lines = courses.map(
    (course) =>
      `- ${course.title} (${course.subjectNameAr} — الصف ${course.year} — ${course.lessonCount} درس)`,
  );
  return `الكورسات المفتوحة دلوقتي (${courses.length}):\n${lines.join('\n')}`;
}

// ── money ──────────────────────────────────────────────────────────────────

/**
 * Piastres → «250 جنيه», with Western digits.
 *
 * The same `-u-nu-latn` convention `apps/web/lib/price.ts` uses for every
 * price a student reads on a page, and it has to be the same one: a chat that
 * says «٢٥٠» beside a card that says «250» reads like two different numbers to
 * someone scanning quickly. Whole pounds, again matching the web formatter —
 * nothing in this shop is priced in half-pounds, and a stray `.5` in a chat
 * bubble would look like a typo rather than a price.
 *
 * ⚠️ The one arithmetic operation المساعد is allowed anywhere near money is
 * this divide-by-100, done here, once. Every figure downstream is a finished
 * string — which is also why the system prompt can tell the model to quote the
 * line rather than compute anything.
 */
const EGP = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });

function egp(cents: number): string {
  return `${EGP.format(cents / 100)} جنيه`;
}

/** «الشحن 65 جنيه», or the word for free — never a bare «0 جنيه». */
function shipping(cents: number): string {
  /*
   * A zero fee is a chosen configuration, not a missing value, and
   * `formatShipping` on the web side exists for exactly this: `0 جنيه` reads
   * as a number that failed to load. Said in words here for the same reason,
   * and the two must not disagree.
   */
  return cents === 0
    ? 'الشحن مجاني على أي أوردر.'
    : `الشحن ${egp(cents)} على الأوردر كله مرة واحدة مهما كان عدد الكتب، مش على كل كتاب لوحده.`;
}

/** One shelf line — title, price, the discount if there is one, and its course. */
function bookLine(book: BookFact): string {
  const price = book.comparePriceCents
    ? `${egp(book.priceCents)} بدل ${egp(book.comparePriceCents)}`
    : egp(book.priceCents);
  const linked = book.courseTitle ? ` — الكتاب الورقي بتاع كورس «${book.courseTitle}»` : '';
  /* Only the bad news is said. «متوفر» on every other line is noise, and the
     absence of a warning is already the answer. */
  const stock = book.inStock ? '' : ' — خلص من المخزن دلوقتي';
  return `- «${book.titleAr}» — ${price}${linked}${stock}`;
}

/**
 * One course line — and the three states «الاشتراك بكام؟» actually has.
 *
 * `requiresGrant` is what decides whether the course is bought at all, not the
 * price columns: a course open to the platform-wide free grant is free to
 * enter no matter what happens to be typed in `monthlyPriceCents`. Reading the
 * columns first and the flag second is how an open course ends up quoted at
 * 150 جنيه a month.
 *
 * The third state is real and must not be smoothed over: a course that DOES
 * need its own grant and has no plan priced is one whose arrangement is not on
 * the platform yet. The honest line is that أيمن settles it — not a guess, and
 * not silence that reads as "free".
 *
 * ## ⚠️ NO BOOK IS NAMED HERE, AND THAT IS THE FIX FOR A REAL BUG
 *
 * This line used to end with «ومعاه كتاب ورقي «<course.bookTitle>» بـ<price>»,
 * reading `Course.bookTitle` as the name of a printed book. It is not one on
 * this platform: the column holds the CTA copy somebody typed into the course
 * editor, and on production BOTH rows that have it say «حجز الكتاب هيتبعتلك
 * لحد البيت». So المساعد announced a sentence as a book, in quotation marks,
 * with a price attached — for a title no shelf carries and no order can be
 * placed against.
 *
 * The books are `bookLine` above, off the `books` table, where `titleAr` is a
 * title and `courseTitle` already says which course each one belongs to. That
 * is the ONE place a book may be named, and the pair is gone from `CourseFact`
 * so this cannot be re-added without also re-adding the columns and reading
 * that service's note on why they are not there.
 */
function courseLine(course: CourseFact): string {
  if (!course.requiresGrant) {
    return `- «${course.title}» (${course.slug}) — مفتوح من غير اشتراك`;
  }

  const plans: string[] = [];
  if (course.monthlyPriceCents !== null) plans.push(`شهري ${egp(course.monthlyPriceCents)}`);
  if (course.quarterlyPriceCents !== null) {
    plans.push(`كل 3 شهور ${egp(course.quarterlyPriceCents)}`);
  }
  if (course.yearlyPriceCents !== null) plans.push(`سنة كاملة ${egp(course.yearlyPriceCents)}`);

  const price = plans.length > 0 ? plans.join(' · ') : 'الاشتراك بيتظبط مع أيمن نفسه';
  return `- «${course.title}» (${course.slug}) — ${price}`;
}

/**
 * The live figures, as entries the corpus can carry.
 *
 * Written as `KnowledgeEntry` rather than as loose prompt text for one concrete
 * reason: `matchKnowledge` — the answer on every deployment with no model key,
 * which is local, CI and any install where nobody has added one — returns an
 * entry's `answer` VERBATIM to the student. So each answer below is a finished
 * Arabic paragraph a fifteen-year-old can read as-is, not a note to a model.
 * That constraint is what keeps the two paths saying the same number.
 *
 * Multi-line, which the rest of the corpus never is. A price list is the one
 * thing here that genuinely is a list, and «كتاب س بـ250 وكتاب ص بـ180 وكتاب ع
 * بـ300…» run into one paragraph is unreadable at twelve titles.
 */
export function priceEntries(facts: AssistantFacts): KnowledgeEntry[] {
  const books =
    facts.books.length === 0
      ? 'مفيش كتب معروضة للبيع دلوقتي.'
      : `أسعار الكتب المتاحة دلوقتي:\n${facts.books.map(bookLine).join('\n')}\n${shipping(
          facts.shippingCents,
        )}`;

  const courses =
    facts.courses.length === 0
      ? 'مفيش كورس منشور دلوقتي.'
      : `أسعار الاشتراك في الكورسات المنشورة دلوقتي:\n${facts.courses
          .map(courseLine)
          .join('\n')}`;

  return [
    { id: 'livePriceBooks', question: 'الكتاب بكام؟', answer: books },
    { id: 'livePriceCourses', question: 'الاشتراك بكام؟', answer: courses },
    { id: 'livePriceShipping', question: 'الشحن بكام؟', answer: shipping(facts.shippingCents) },
  ];
}

/**
 * What the model is told about money on THIS request.
 *
 * ⚠️ Belongs in the per-request context beside `# CATALOG`, never in `SYSTEM`.
 * The system prefix is byte-stable so providers can cache it; one price in
 * there would both invalidate that cache on every change and — far worse —
 * freeze a number for the life of the process. The caller writes:
 *
 *     `# PRICES\n${pricingBlock(await facts.read())}`
 *
 * The preamble is in English because it is a RULE and the lines under it are
 * in Arabic because they are OUTPUT — the same split `SYSTEM` draws and for
 * the same reason.
 *
 * ## `null` is the important half of this function
 *
 * There is no third state and no last-known figure. When the read failed,
 * المساعد is told it knows no prices at all and must escalate — see
 * `AssistantFactsService`, which drops its snapshot rather than serve it. The
 * failure mode this prevents is the expensive one: a confident, wrong, current
 * -sounding price, quoted to someone who then transfers that amount.
 */
export function pricingBlock(facts: AssistantFacts | null): string {
  if (!facts) {
    return [
      'Prices could NOT be read for this request. Right now you know NO price on this platform.',
      '- Do not state, estimate, round or recall any figure for a book, a subscription, or delivery — not from earlier in this conversation, not from the KNOWLEDGE block, and not from anything you believe you know.',
      '- Say in ONE short sentence that the current price needs checking with أيمن, and end the message with the escalation marker described under «When you do not know» above. Wording along the lines of «الأسعار بتتغيّر وأنا مش شايف الرقم الحالي دلوقتي — أوصّل السؤال لأيمن وهو اللي يقول بالظبط.»',
    ].join('\n');
  }

  const rules = [
    'These figures were read from the database moments ago and are the CURRENT prices. State them exactly as written.',
    '- They OVERRIDE any KNOWLEDGE entry above that says prices change and declines to name a number. That entry is what to say when this block is missing, not when it is here.',
    '- Quote the line. Never add plans together, apply a discount, split a price across months, or work out what something "comes to" — arithmetic on money is not something you do.',
    '- Say the price for what was ASKED about. A student asking about one book does not want the whole shelf read out.',
  ].join('\n');

  return [rules, ...priceEntries(facts).map((entry) => `س: ${entry.question}\nج: ${entry.answer}`)].join(
    '\n\n',
  );
}

// ── the no-model path ──────────────────────────────────────────────────────

/**
 * Arabic, flattened enough that «الامتحان» and «امتحانات» collide.
 *
 * Not a stemmer and not trying to be one: hamza forms, ta marbuta, the
 * definite article and the diacritics a phone keyboard sometimes leaves
 * behind. That is the difference between a student's spelling and the copy
 * writer's, which is the only difference this has to survive.
 */
function normalise(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .toLowerCase();
}

/**
 * One word, with «ال» taken off the front.
 *
 * Applied per TOKEN and not to the whole string, because it is only safe once
 * the word boundaries are known — and only when something is left: «الله» and
 * «ألم» must not become «له» and «م». Five characters is the floor, which
 * keeps «الكل» intact and lets «الملخصات» reach «ملخصات».
 *
 * Not a stemmer. Arabic broken plurals («نتيجة» → «نتائج») are beyond anything
 * this shape can do, and pretending otherwise is how a matcher starts
 * returning confident nonsense. What is out of reach here is covered by
 * SEARCH_ALIASES below instead — explicitly, one entry at a time.
 */
function stem(word: string): string {
  return word.length >= 5 && word.startsWith('ال') ? word.slice(2) : word;
}

/** Words too common to carry meaning — Egyptian Arabic, not MSA. */
const STOPWORDS = new Set(
  [
    'في',
    'من',
    'علي',
    'عن',
    'مع',
    'ده',
    'دي',
    'ايه',
    'اي',
    'ازاي',
    'امتي',
    'ليه',
    /*
     * «فين» and «منين» are where, not what — and they were actively harmful:
     * «نتيجتي فين» matched the privacy entry, whose question happens to be
     * «بياناتي بتروح فين». A question word that appears across the corpus is
     * noise with a score attached.
     */
    'فين',
    'منين',
    /*
     * «مين» is a question word too, and it was scoring: «مين هيكسب الماتش
     * النهارده؟» matched «إنت مين؟» on that one word and answered a football
     * question with المساعد introducing itself. «مين أيمن؟» still resolves —
     * it always did it on «أيمن», never on «مين».
     */
    'مين',
    'عايز',
    'عاوز',
    'اقدر',
    'ممكن',
    'عندي',
    'حاجه',
    'هو',
    'هي',
    'انا',
    'انت',
    'احنا',
    'هل',
    'ولا',
    'كمان',
    'بس',
    'اللي',
    'يعني',
    'عشان',
    'لو',
    'مش',
    'ال',
    'وال',
    'and',
    'the',
    'a',
    'is',
  ].map(normalise),
);

function tokens(text: string): string[] {
  return normalise(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
}

/** Every entry's tokens, computed once. */
/**
 * Words a student uses that the ANSWER does not contain.
 *
 * ⚠️ This is retrieval metadata, not copy, and that is why it lives here and
 * not in `copy/ar.ts`: none of it is ever shown to anybody. Keeping it beside
 * the matcher also lets it cover the script-derived entries, which the copy
 * table has no field for.
 *
 * Every line below is a real miss, measured against the phrasings students
 * actually type, not a guess at what they might:
 *
 *   «نتيجتي فين»      matched the PRIVACY entry — «نتيجة» and «نتائج» share no
 *                     letters a prefix match can reach, and Arabic broken
 *                     plurals are past what `stem()` should ever attempt.
 *   «حسابي متقفل ليه» matched DEVICES — «متقفل» is nowhere near «موقوف».
 *   «الباسورد»        matched nothing — it is English, in Arabic letters.
 *
 * The rule for adding a line: it names a word a student would TYPE. It is not
 * a place to widen an entry's meaning — `matchKnowledge`'s threshold is the
 * only thing standing between "no answer" and a confident wrong one, and every
 * alias here spends some of it.
 */
const SEARCH_ALIASES: Readonly<Record<string, string>> = {
  passwordLost: 'الباسورد الباسوورد الرقم السري كلمه السر نسيت ضاعت',
  accountPassword: 'الباسورد الباسوورد الرقم السري نسيت ضاعت',
  resultsWhere: 'نتيجتي نتيجه درجتي درجاتي الدرجات المجموع',
  banned: 'متقفل مقفول اتقفل اتوقف موقوف حظر بلوك',
  loginHow: 'ادخل الدخول تسجيل لوجين',
  enter: 'اسجل التسجيل حساب جديد اشترك انضم',
  devices: 'جهاز موبايل لابتوب حد تاني داخل',
  downloads: 'ملخص ملخصات pdf بي دي اف تحميل انزل',
  install: 'تطبيق ابليكشن app بلاي ستور',
  gradeLate: 'درجتي نتيجتي متاخره ماظهرتش',
  lessonLocked: 'مقفول قفل مش فاتح مش راضي يفتح',
  accountVideo: 'الفيديو الفيديوهات مشغلش واقف بيهنج',
  studyRetake: 'اعيد اعادة تاني محاوله',
  joinPrice: 'بكام سعر فلوس تمن دفع',
  coursesWhere: 'كورساتي كورسات دروسي',
  playground: 'اجرب اكتب كود محرر',

  /*
   * The three live-price entries. Same rule as every line above — a word a
   * student TYPES — and they need it more than most, because their answers are
   * generated and so contain whatever the titles on the shelf happen to be
   * this month rather than any of the words «بكام», «سعر» or «اشتراك».
   */
  livePriceBooks: 'الكتاب الكتب بكام سعر تمن فلوس اشتري اطلب',
  livePriceCourses: 'الاشتراك اشتراك الكورس بكام سعر تمن فلوس شهري سنوي',
  livePriceShipping: 'الشحن التوصيل الديليفري بكام مصاريف',
};

interface IndexedEntry {
  readonly entry: KnowledgeEntry;
  readonly words: ReadonlySet<string>;
  readonly strong: ReadonlySet<string>;
}

function indexEntries(entries: readonly KnowledgeEntry[]): IndexedEntry[] {
  return entries.map((entry) => ({
    entry,
    words: new Set([
      ...tokens(entry.question),
      ...tokens(entry.answer),
      ...tokens(SEARCH_ALIASES[entry.id] ?? ''),
    ]),
    /**
     * Question words count double — they are the short form of the ask.
     * Aliases are STRONG too: they were written precisely because they are how
     * the question gets asked, which is the same job the question line does.
     */
    strong: new Set([...tokens(entry.question), ...tokens(SEARCH_ALIASES[entry.id] ?? '')]),
  }));
}

const INDEX = indexEntries(KNOWLEDGE);

/**
 * The written entries a live price REPLACES rather than competes with.
 *
 * `joinPrice` is «الأسعار بتتغيّر، مش عايز أقولك رقم قديم» — the correct answer
 * for as long as there was no number, and the wrong one the moment there is.
 * Left in the index it would also usually WIN: it is short, its every token is
 * about price, and a generated shelf listing is mostly book titles. So a
 * student would be told the prices change while the current ones sat one entry
 * away.
 *
 * Dropped only when live entries are actually present. With no facts —
 * a failed read, or a caller that passes none — `joinPrice` is back and is
 * again exactly right.
 */
const REPLACED_BY_LIVE_PRICES: ReadonlySet<string> = new Set(['joinPrice']);

const INDEX_WITHOUT_PRICES = INDEX.filter(
  ({ entry }) => !REPLACED_BY_LIVE_PRICES.has(entry.id),
);

/**
 * The index for one snapshot, remembered against that snapshot's identity.
 *
 * `AssistantFactsService` hands out the same frozen object for a minute at a
 * time, so a one-slot cache keyed on it turns "re-tokenise the whole shelf on
 * every question" into "once a minute". A `WeakMap` would do the same and
 * outlive nothing useful — there is only ever one current snapshot.
 */
let priceIndexFor: { facts: AssistantFacts; index: IndexedEntry[] } | null = null;

function indexWith(facts: AssistantFacts): IndexedEntry[] {
  if (priceIndexFor?.facts !== facts) {
    priceIndexFor = {
      facts,
      index: [...indexEntries(priceEntries(facts)), ...INDEX_WITHOUT_PRICES],
    };
  }
  return priceIndexFor.index;
}

/**
 * The best written answer for a typed question, or `null` when nothing is
 * close enough to be worth saying.
 *
 * ## This is not a fallback for the model — it is the answer when there is no model
 *
 * `ANTHROPIC_API_KEY` is unset in local development, in CI, and on any
 * deployment where the instructor has not added one. A route that 503s in
 * those three places would make the whole chat look broken to the person
 * evaluating whether to turn it on. So the panel still answers: worse, from
 * the same paragraphs, with «أكلّم م. أيمن» pushed forward — which is the
 * honest shape of "I only have the script today".
 *
 * `null` is a real and frequent answer, and the caller says so plainly rather
 * than reaching for the least-bad entry. A confident wrong paragraph is worse
 * than «السؤال ده محتاج أيمن».
 *
 * ## `facts` — the same numbers the model path gets, on the path with no model
 *
 * Optional, and the two states are both correct rather than one being a
 * degraded version of the other:
 *
 *   a snapshot → «الكتاب بكام؟» is answered with today's shelf, verbatim, and
 *                `joinPrice` steps aside for it.
 *   `null`     → nothing here knows a price, `joinPrice` answers, and it says
 *                «هوصّلك لأيمن يقولك السعر الحالي» — which is true.
 *
 * ⚠️ There is no path through this function that returns a price older than
 * the snapshot it was handed. It never keeps one: `indexWith` rebuilds the
 * moment the service hands over a different object, and the service hands over
 * `null` rather than an expired one.
 */
export function matchKnowledge(
  question: string,
  facts?: AssistantFacts | null,
): KnowledgeEntry | null {
  const asked = tokens(question);
  if (asked.length === 0) return null;

  let best: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const { entry, words, strong } of facts ? indexWith(facts) : INDEX) {
    let score = 0;
    for (const word of asked) {
      if (strong.has(word)) score += 2;
      else if (words.has(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  /*
   * Two matching content words, or one that appeared in the entry's own
   * question. Below that the "match" is a shared word like «كورس», which every
   * entry contains — and answering «الكورس بكام؟» with the unit structure of a
   * course is exactly the failure this threshold exists to prevent.
   */
  return bestScore >= 2 ? best : null;
}
