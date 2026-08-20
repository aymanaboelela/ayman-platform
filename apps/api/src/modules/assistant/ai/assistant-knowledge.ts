import { copy } from '@ayman/contracts/copy';
import {
  ASSISTANT_NODES,
  ASSISTANT_ROOT,
  isNextChoice,
  type AssistantNodeId,
} from '@ayman/contracts/assistant/script';
import type { CatalogCourse } from '@ayman/contracts/catalog';

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
 * Prices, dates, offers, and anything about a specific student. The first two
 * change without anyone touching this repo — `joinPrice` in the tree already
 * refuses to name a number for exactly that reason — and the third is not
 * knowledge, it is a database read this module has no session to authorise.
 * Both roads end at the same place: «أوصّلك لأيمن».
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
 * Facts about the platform ITSELF, which the tree never states because every
 * node assumes them.
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

/** The whole corpus, built once at module load — nothing here reads a request. */
export const KNOWLEDGE: readonly KnowledgeEntry[] = [...platformFacts(), ...scriptEntries()];

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
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Every entry's tokens, computed once. */
const INDEX = KNOWLEDGE.map((entry) => ({
  entry,
  words: new Set([...tokens(entry.question), ...tokens(entry.answer)]),
  /** Question words count double — they are the short form of the ask. */
  strong: new Set(tokens(entry.question)),
}));

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
 */
export function matchKnowledge(question: string): KnowledgeEntry | null {
  const asked = tokens(question);
  if (asked.length === 0) return null;

  let best: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const { entry, words, strong } of INDEX) {
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
