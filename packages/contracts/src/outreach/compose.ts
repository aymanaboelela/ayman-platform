import { formatCopy } from '@ayman/contracts/format';
import {
  COURSE_LINK_LINE,
  FOCUS_INTROS,
  FOCUS_ITEM,
  FOCUS_FEW,
  FOCUS_MANY,
  FOCUS_RESTART,
  FOCUS_SINGLE,
  FOCUS_SINGLE_NAMED,
  FOCUS_SINGLE_PLAIN,
  FOCUS_ITEM_UNTITLED,
  FOCUS_TAILS,
  FOCUS_TWO,
  FOLLOW_UP_ASKS,
  FOLLOW_UP_CLOSERS,
  FOLLOW_UP_LESSON_MANY,
  FOLLOW_UP_LESSON_SINGLE,
  FOLLOW_UP_OPENERS,
  FOLLOW_UP_QUIZ_MANY,
  FOLLOW_UP_QUIZ_SINGLE,
  LIST_LAST_SEPARATOR,
  LIST_SEPARATOR,
  NUDGE_BODIES,
  NUDGE_CLOSERS,
  NUDGE_OPENERS,
  OUTREACH_GREETINGS,
  PRAISE_BODIES,
  PRAISE_CLOSERS,
  PRAISE_OPENERS,
  QUESTION_NUMBER_SEPARATOR,
  QUIZ_CLOSERS,
  QUIZ_RESULT_OPENERS,
  QUIZ_SCORE_LINES,
  REFERRAL_REWARD_BODIES,
  REFERRAL_REWARD_CLOSERS,
  REFERRAL_REWARD_OPENERS,
  STRENGTH_LINES,
  SUBSCRIBE_BODIES,
  SUBSCRIBE_BODIES_UNKNOWN,
  SUBSCRIBE_CLOSERS,
  SUBSCRIBE_OPENERS,
  TITLE_QUOTE,
  WHATSAPP_BODIES,
  WHATSAPP_CLOSERS,
  WHATSAPP_LINK_LINE,
  WHATSAPP_OPENERS,
  WHATSAPP_TAGALONGS,
  type OutreachBand,
} from '@ayman/contracts/copy/outreach';
import {
  CHECKOUT_BODIES,
  CHECKOUT_BOOK_OPENERS,
  CHECKOUT_CLOSERS,
  CHECKOUT_COURSE_OPENERS,
  SIGNUP_BODIES,
  SIGNUP_BODIES_UNKNOWN,
  SIGNUP_CLOSERS,
  SIGNUP_OPENERS,
  SIGNUP_SECOND_OPENERS,
} from '@ayman/contracts/copy/outreach-auto';

/**
 * Turns facts into a message that reads as if a person wrote it, and picks a
 * different wording every time.
 *
 * ## Pure, and that is the point
 *
 * No database, no clock, no `Math.random()`. Given the same student, the same
 * facts and the same history it returns the same message — which is what makes
 * the admin preview screen honest (it shows the real composer, not a mock-up),
 * what makes the variety testable at all, and what stops a retried delivery
 * from producing a second, differently-worded copy of a message already sent.
 *
 * ## How "never the same twice" actually works
 *
 * Each slot (greeting, opener, score line, closer…) is chosen from its pool by
 * `pickIndex`, which is handed the indices used by this student's LAST few
 * messages and refuses to reuse any of them. It blocks at most `poolSize - 1`,
 * so a candidate always remains — the function can never fail to pick, and the
 * student walks the whole pool before any entry comes round again.
 *
 * The tie-break among the remaining candidates is a hash of `seed + slot`, not
 * a counter: two slots must not move in lockstep, or the pools stop being
 * independent and the real number of distinct messages collapses from
 * `7 × 6 × 5 × 5 × 5` to `7`.
 *
 * ## Why the composed BODY is stored rather than re-derived
 *
 * Global Constraint 4 keeps rendered sentences out of the database, and every
 * notification in this codebase obeys it: the row holds ids and numbers and the
 * client composes the text, so re-wording is an edit here rather than a data
 * migration.
 *
 * A SENT MESSAGE is the documented exception. It is a record of something that
 * happened — the instructor said this, on this date — and a record that
 * silently re-words itself when the pool is edited is not a record. Worse, the
 * admin's own «اللي بعتّه» screen would then show him something other than what
 * the student read. So the composer runs once, at send time, and
 * `conversation_messages.body` keeps what was actually said. The POOLS still
 * live here, in the copy package, which is what Global Constraint 4 is really
 * protecting: no Arabic prose inside a component, one place to edit the voice.
 */

/** A weak (or strong) area of one paper. */
export interface OutreachTopic {
  /** The question bank category. `null` when the questions carry none. */
  name: string | null;
  /** Slot positions on the paper, ascending. What the student sees as «سؤال ٣». */
  questionNumbers: number[];
}

export type OutreachFacts =
  | {
      kind: 'quiz_result';
      quizTitle: string;
      /** 0–100, already rounded. */
      scorePercent: number;
      weakTopics: OutreachTopic[];
      /** Categories the student got completely right. Names only. */
      strongTopics: string[];
    }
  | { kind: 'quiz_nudge'; lessonTitle: string }
  | { kind: 'lesson_praise'; lessonTitle: string }
  | { kind: 'whatsapp_invite' }
  | {
      kind: 'follow_up';
      /**
       * Lecture titles that went by untouched, newest first. May be empty —
       * but not at the same time as `missedQuizzes`, which `/admin/follow-up`
       * guarantees by never listing a student with nothing missed.
       */
      missedLessons: string[];
      /** Quiz titles with no submitted sitting. Same shape, same guarantee. */
      missedQuizzes: string[];
    }
  | {
      kind: 'subscribe_nudge';
      /**
       * The course this student's own year and stream point at, or `null` when
       * the profile does not say enough to pick one — see
       * `SUBSCRIBE_BODIES_UNKNOWN` for why that is a different sentence rather
       * than the same one with a blank in it.
       */
      courseTitle: string | null;
      /** Absolute. The course page when there is a course, else the catalog. */
      url: string;
    }
  | {
      kind: 'checkout_recovery';
      /** What the abandoned payment step was buying. */
      target: 'course' | 'book_order';
      /** The course title. `null` for a book order — the openers name none. */
      title: string | null;
      /** Absolute deep link back to the very step that was left. */
      url: string;
    }
  | {
      kind: 'signup_nudge';
      /** First nudge, or the optional second one days later. */
      step: 1 | 2;
      /** The course the student's year and stream point at, or `null`. */
      courseTitle: string | null;
      /** Absolute. That course's page, else the catalog. */
      url: string;
    }
  | {
      /**
       * «مكافأة الدعوة نزلت» — a friend who signed up through this student's
       * share link made a first real payment, and the reward landed.
       *
       * ⚠️ NOT one of `OUTREACH_KINDS`. It is composed here, so it gets the
       * same voice, the same greeting pool and the same variety, but it is
       * delivered over WhatsApp by `ReferralNoticeService` and is never
       * written to `outreach_messages` — its once-only guard is the referral
       * row's own `notice_at`, claimed before the send.
       */
      kind: 'referral_reward';
      /** The reward, in whole pounds, already formatted. */
      amount: string;
    };

export interface ComposeInput {
  /** The student's first name. `firstNameOf` derives it from the account name. */
  firstName: string;
  /**
   * Who is sending, as the student should read it — «مهندس أيمن» on his stack,
   * the deployment's own `TENANT_DISPLAY_NAME` on any other.
   *
   * ## Why this is a parameter and not something this file works out
   *
   * It is the ONE gate on this path, and until it existed there was none at
   * all. `OUTREACH_GREETINGS` entry 4 introduced the sender BY NAME, `pickIndex`
   * draws that pool uniformly, and `OutreachService.deliver` persists and sends
   * whatever comes back — so every instructor's platform was telling roughly
   * one student in eight «أنا مهندس أيمن», in the first person, in a thread
   * they can reply to. Nothing about it looked broken from inside the code.
   *
   * The two shapes worth considering were a parameter and a `process.env` read
   * inside `packages/contracts`. The env read loses twice:
   *
   *   · it FAILS OPEN wherever the variable is not inlined. This package is
   *     bundled into the browser as well as loaded by the API, and `TENANT_KEY`
   *     reaches web client code only because `apps/web/next.config.ts` lists it
   *     under `env:` — nothing carries that guarantee to the next consumer of
   *     `@ayman/contracts`. Failing open here means printing his name, which is
   *     the single outcome the whole gate design is written upside-down to
   *     prevent.
   *   · it costs this function its purity, which the header above argues for at
   *     length: the admin preview is honest only because it runs the REAL
   *     composer, and a retried delivery is idempotent only because the same
   *     inputs give the same body.
   *
   * So the callers that already sit beside the API's gate module resolve it
   * once at module load and hand it in, and this file stays a pure function of
   * its arguments.
   *
   * Interpolated as `{instructor}`, and offered to EVERY pool rather than only
   * to the greetings — a closer that one day signs off by name then needs no
   * change here, which is the reason for doing this as a placeholder instead of
   * a conditional wrapped around one array entry.
   */
  instructorName: string;
  facts: OutreachFacts;
  /**
   * The `variantKey` of this student's previous messages, NEWEST FIRST.
   *
   * Across all kinds, not just this one: the greeting pool is shared, and a
   * student who gets «إزيك يا محمد 👋» on a result and again on a nudge an hour
   * later has caught us, whatever the two messages then went on to say.
   */
  recentVariantKeys: readonly string[];
  /** `null` when the admin has not set one — then no group line is ever added. */
  whatsappUrl: string | null;
  /**
   * Stable per message. The delivery id, or the attempt id — anything that is
   * the same on a retry and different between messages.
   */
  seed: string;
}

export interface ComposedOutreach {
  /** `g=2|o=4|s=1|c=0|w=3`. Stored, and fed back in as history. */
  variantKey: string;
  /** Plain text, `\n`-separated. Never HTML — there is no sink on this path. */
  body: string;
}

/** Cut-offs for the four tone bands. */
const BAND_EXCELLENT = 90;
const BAND_STRONG = 75;
const BAND_FAIR = 50;

/** At most this many bullets, so the message stays a message. */
const MAX_FOCUS_TOPICS = 3;
/**
 * More wrong answers than this and the numbers are not listed at all. Six
 * still reads as a sentence («سؤال 2 و 4 و 5 و 7 و 9 و 11»); past that it is
 * a column of figures in a chat bubble, which nobody acts on.
 */
const MAX_LISTED_QUESTIONS = 6;
/** Naming five things someone is good at reads as filler, not praise. */
const MAX_STRENGTH_TOPICS = 2;

/**
 * One in three messages carries the group nudge — enough that a student who
 * has not joined keeps being asked, rare enough that it does not become the
 * thing every message is really about. Never twice in a row; see `wantsGroup`.
 */
const GROUP_TAGALONG_ODDS = 3;

/** Kinds that already end on something to press. See `shouldAddGroup`'s caller. */
const NO_TAGALONG: ReadonlySet<OutreachFacts['kind']> = new Set([
  'whatsapp_invite',
  'follow_up',
  'subscribe_nudge',
  // Both end on ONE link that is the whole point, and both are also sent as a
  // WhatsApp message — where a second link would steal the preview.
  'checkout_recovery',
  'signup_nudge',
  // Already on WhatsApp — inviting them to the channel from inside it is noise.
  'referral_reward',
]);

export function bandFor(scorePercent: number): OutreachBand {
  if (scorePercent >= BAND_EXCELLENT) return 'excellent';
  if (scorePercent >= BAND_STRONG) return 'strong';
  if (scorePercent >= BAND_FAIR) return 'fair';
  return 'weak';
}

/**
 * «محمد أحمد السيد» → «محمد»، «عبد الرحمن خالد» → «عبد الرحمن»، and
 * «MARAWAN» → «Marawan».
 *
 * A message that opens with someone's full three-part name is a bank letter,
 * so the greeting takes the first name. Returns an EMPTY string whenever the
 * first word is not safely a name, and every caller drops the «يا {name}»
 * around it (`omitName`) rather than print a guess.
 *
 * ## Why "the first word" was not enough
 *
 * It is what this function used to return, and live messages showed what that
 * costs: «يا عبد» for «عبد الرحمن …» (half a compound name, and on its own a
 * word nobody wants to be called), «يا M.» for «M. Ahmed Anwar», and a student
 * greeted by a title or a parent's word that headed the account name. So:
 *
 *   · **compound first names stay whole.** «عبد»/«أبو» (and their Latin
 *     spellings) always take the next word, and a second word from the short
 *     list of compound tails — «نور الدين»، «سيف الإسلام»، «جاد الله» — joins
 *     the first. The tails are a LIST, not "anything starting with ال", because
 *     «محمد السيد» is a first name and a father's name, and greeting someone as
 *     both is its own kind of wrong.
 *   · **an initial, an abbreviation or a title means no name.** «M.»، «م»،
 *     «أ/»، «Mr»، «الطالب»، «ولي» — the next word is NOT promoted in their
 *     place, because after a title or an initial nothing says which word is
 *     the student's own: in «M. Ahmed Anwar», «Ahmed» is most likely the
 *     father. A greeting without a name reads as a person who did not use it;
 *     a greeting with the wrong one reads as a machine that guessed.
 *
 * ## Why the case is touched at all
 *
 * Because plenty of students type their name in caps lock, and the greeting is
 * the one place the platform prints it inside a sentence: «MARAWAN، إزي حالك؟»
 * reads as shouting in a line that is meant to sound like a person saying
 * hello. Only ALL-CAPS is rewritten — a name with a lowercase letter anywhere
 * in it («McDonald», «di Sarno») is left exactly as typed, because those
 * capitals are the person's own choice and "fixing" them is how a greeting
 * starts spelling someone's name wrong.
 *
 * Arabic has no case at all, so `\p{Lu}` never matches an Arabic name and this
 * is a no-op on almost every student the platform has.
 */
export function firstNameOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/u).filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined || !isNameWord(first) || NOT_A_NAME.has(fold(first))) return '';

  const second = words[1];
  const third = words[2];
  let picked: string[] = [first];

  if (COMPOUND_HEADS.has(fold(first))) {
    // «عبد» / «أبو» alone is exactly the «يا عبد» this exists to stop.
    if (second === undefined || !isNameWord(second)) return '';
    // «Abd El Rahman» — the Latin spelling often splits the article off.
    picked =
      LATIN_ARTICLES.has(fold(second)) && third !== undefined && isNameWord(third)
        ? [first, second, third]
        : [first, second];
  } else if (second !== undefined && COMPOUND_TAILS.has(fold(second))) {
    picked = [first, second];
  } else if (
    second !== undefined &&
    third !== undefined &&
    LATIN_ARTICLES.has(fold(second)) &&
    LATIN_TAILS.has(fold(third))
  ) {
    // «Nour El Din».
    picked = [first, second, third];
  }

  return picked.map(unshout).join(' ');
}

/**
 * Letters only (plus the joiners a real name carries — «O'Brien»،
 * «Anne-Marie», tatweel, harakat), and at least two of them. That one test
 * turns away «M.»، «م»، «أ/»، «A»، a phone number and an email address.
 */
function isNameWord(word: string): boolean {
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’ـ-]*$/u.test(word)) return false;
  return (word.match(/\p{L}/gu) ?? []).length >= 2;
}

/** Lowercase, hamza-folded — «أبو» and «ابو» are one word to a keyboard. */
function fold(word: string): string {
  return word.toLowerCase().replace(/[أإآ]/gu, 'ا');
}

/** Per LETTER RUN, so «ANNE-MARIE» and «O'BRIEN» keep the capital after the separator. */
function unshout(word: string): string {
  const shouting = /\p{Lu}/u.test(word) && !/\p{Ll}/u.test(word);
  return shouting ? word.replace(/\p{L}+/gu, (run) => run[0] + run.slice(1).toLowerCase()) : word;
}

/** Folded. Always take the next word: «عبد الرحمن»، «أبو بكر»، «Abdel Rahman». */
const COMPOUND_HEADS: ReadonlySet<string> = new Set([
  'عبد', 'ابو', 'abd', 'abdel', 'abdul', 'abdal', 'abd-el', 'abu', 'abo', 'abou',
]);

/** Folded. A second word that is part of the FIRST name, never a father's name. */
const COMPOUND_TAILS: ReadonlySet<string> = new Set([
  'الدين', 'الاسلام', 'الله', 'الرحمن', 'الرحيم', 'الحق', 'النبي', 'الرب',
  'eldin', 'el-din', 'aldin', 'al-din', 'eldeen', 'el-deen', 'eddin', 'uddin', 'allah',
]);

const LATIN_ARTICLES: ReadonlySet<string> = new Set(['el', 'al']);
const LATIN_TAILS: ReadonlySet<string> = new Set(['din', 'deen', 'islam', 'eslam']);

/**
 * Folded. Titles, roles and kinship words that head an account name typed by
 * someone other than the student, or by the student out of habit. None of
 * them is the student's name, and the word after them is not reliably one.
 */
const NOT_A_NAME: ReadonlySet<string> = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'eng', 'student',
  'مستر', 'ميس', 'مس', 'دكتور', 'دكتوره', 'دكتورة', 'مهندس', 'مهندسه', 'مهندسة',
  'استاذ', 'استاذه', 'استاذة', 'الاستاذ', 'الاستاذه', 'الاستاذة', 'المهندس', 'الدكتور',
  'طالب', 'طالبه', 'طالبة', 'الطالب', 'الطالبه', 'الطالبة',
  'ولي', 'والد', 'والده', 'والدة', 'ام', 'حاج', 'الحاج', 'حاجه', 'الحاجه', 'كابتن',
]);

/**
 * Takes the «يا {name}» out of a line when there is no name to put in it.
 *
 * `firstNameOf` returns '' rather than guess, and a blank in a greeting is
 * worse than no name: «يا ، كتابك…» / «أهلاً يا » read as a template that
 * broke. Handles the three shapes the pools use — the name leading the line
 * («{name}، أخبارك إيه؟»، «يا {name}، إزيك؟») and the vocative inside it
 * («إزيك يا {name} 👋») — and blanks any other occurrence.
 *
 * `token` is the literal placeholder, so the campaign renderer's own
 * «{{الاسم}}» works the same as `{name}`.
 */
export function omitName(text: string, token: string): string {
  const t = token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text
    .replace(new RegExp(`(^|\\n)[^\\S\\n]*(?:يا[^\\S\\n]+)?${t}[^\\S\\n]*[،,]?[^\\S\\n]*`, 'gu'), '$1')
    .replace(new RegExp(`[^\\S\\n]*يا[^\\S\\n]+${t}`, 'gu'), '')
    .split(token)
    .join('');
}

/**
 * A `{name}` template addressed to someone by their account or order name —
 * the first name when there safely is one, and no vocative at all when there
 * is not. For the one-off notices (the book's shipping and courier messages)
 * that greet a student outside `composeOutreach`.
 */
export function formatWithName(
  template: string,
  fullName: string,
  vars: Record<string, string | number> = {},
): string {
  const name = firstNameOf(fullName);
  return formatCopy(name ? template : omitName(template, '{name}'), { ...vars, name });
}

export function composeOutreach(input: ComposeInput): ComposedOutreach {
  const history = input.recentVariantKeys.map(parseVariantKey);
  const chosen = new Map<string, number>();

  /** Picks from `pool`, records the index under `slot`, returns the string. */
  const take = (slot: string, pool: readonly string[]): string => {
    const index = pickIndex(slot, pool.length, history, hash(`${input.seed}:${slot}`));
    chosen.set(slot, index);
    return pool[index]!;
  };

  /*
   * `instructor` sits beside `name` in the BASE vars, so it is spread into
   * every `scoped` object below and is available to any pool. Only the one
   * greeting uses it today; putting it here rather than at that call site is
   * what stops the next line that wants it from reaching for a literal.
   */
  const vars: Record<string, string | number> = {
    name: input.firstName,
    instructor: input.instructorName,
  };
  // No name (`firstNameOf` refused to guess) → no «يا {name}» either; a
  // greeting with a hole in it is worse than one without the name.
  const greeting = take('g', OUTREACH_GREETINGS);
  const blocks: string[][] = [
    [formatCopy(input.firstName ? greeting : omitName(greeting, '{name}'), vars)],
  ];

  const wantsGroup = shouldAddGroup(input, history);

  switch (input.facts.kind) {
    case 'quiz_result': {
      const facts = input.facts;
      const band = bandFor(facts.scorePercent);
      const scoped = { ...vars, quiz: facts.quizTitle, score: facts.scorePercent };

      blocks.push([
        formatCopy(take('o', QUIZ_RESULT_OPENERS), scoped),
        formatCopy(take(`s.${band}`, QUIZ_SCORE_LINES[band]), scoped),
      ]);

      const weak = facts.weakTopics.slice(0, MAX_FOCUS_TOPICS);
      /*
       * ⚠️ The wording is chosen by the number of wrong QUESTIONS, never by
       * the number of topics.
       *
       * A topic is a question-bank category, and a paper whose questions carry
       * none arrives as ONE nameless topic holding every wrong answer. Keyed
       * on `weak.length === 1`, a 0% paper went out as «فيه غلطة واحدة …
       * (سؤال 1 و 2 و 3 … و 40) — دقيقة مراجعة مش أكتر»: the count wrong,
       * forty numbers in a chat bubble, and a "tiny slip" framing on a paper
       * that needs the lesson again. So:
       *
       *   · a paper in the weak band gets `FOCUS_RESTART` — no numbers, no
       *     "it was one small thing", one honest line that the lesson is the
       *     place to start, which the weak score line above already softened;
       *   · more wrong answers than fit in a sentence get `FOCUS_MANY` — no
       *     numbers either, because a list of fifteen is a bill, not help;
       *   · otherwise the wording names the real count: one, two, or a few.
       */
      const wrongCount = facts.weakTopics.reduce((sum, topic) => sum + topic.questionNumbers.length, 0);
      if (wrongCount > 0 && band === 'weak') {
        blocks.push([take('fr', FOCUS_RESTART)]);
      } else if (wrongCount > MAX_LISTED_QUESTIONS) {
        blocks.push([take('fm', FOCUS_MANY)]);
      } else if (weak.length > 0) {
        /*
         * ⚠️ ONE mistake is a SENTENCE, not a bulleted list with a heading
         * over it and a reassurance under it.
         *
         * A 93% paper with a single slip used to arrive as five paragraphs:
         * greeting, opener, score, «الغلطات اللي في الورقة، وكلها بسيطة:», a
         * bullet, «شرحهم بسيط جداً…», a strength line, and a closer. The
         * student who received exactly that replied «يعني اي» — «مش بتبقى
         * مفهومة» was the report, and seven lines about one wrong answer is
         * why. Structure that heavy reads as a form letter no matter how warm
         * the words in it are.
         *
         * So the list shape is kept for the case it was built for — several
         * topics, where a heading and bullets genuinely help — and a single
         * topic is folded into one line. Same facts, a third of the message.
         */
        if (weak.length === 1) {
          // Same one-line shape, but the sentence has to say how many: «غلطة
          // واحدة» over «سؤال 2 و 4 و 5» is the message that shipped.
          const [slot, pool] =
            wrongCount === 1 ? ['f1', FOCUS_SINGLE] : wrongCount === 2 ? ['f2', FOCUS_TWO] : ['f3', FOCUS_FEW];
          blocks.push([formatCopy(take(slot, pool), { topic: renderFocusInline(weak[0]!) })]);
        } else {
          blocks.push([
            take('f', FOCUS_INTROS),
            ...weak.map((topic) => renderFocusItem(topic)),
          ]);
          blocks.push([take('t', FOCUS_TAILS)]);
        }
      }

      /*
       * The praise line goes only when there is nothing to fix.
       *
       * Beside a list of mistakes it is a "but also" that adds a paragraph and
       * blunts both halves — the student reads neither the correction nor the
       * compliment. On a clean paper it is the whole point of writing.
       */
      const strong = weak.length === 0 ? facts.strongTopics.slice(0, MAX_STRENGTH_TOPICS) : [];
      if (strong.length > 0) {
        blocks.push([
          formatCopy(take('p', STRENGTH_LINES), { ...scoped, topics: joinArabic(strong) }),
        ]);
      }

      blocks.push([formatCopy(take(`c.${band}`, QUIZ_CLOSERS[band]), scoped)]);
      break;
    }

    case 'quiz_nudge': {
      const scoped = { ...vars, lesson: input.facts.lessonTitle };
      blocks.push([formatCopy(take('o', NUDGE_OPENERS), scoped)]);
      blocks.push([formatCopy(take('b', NUDGE_BODIES), scoped)]);
      blocks.push([formatCopy(take('c', NUDGE_CLOSERS), scoped)]);
      break;
    }

    case 'lesson_praise': {
      const scoped = { ...vars, lesson: input.facts.lessonTitle };
      blocks.push([formatCopy(take('o', PRAISE_OPENERS), scoped)]);
      blocks.push([formatCopy(take('b', PRAISE_BODIES), scoped)]);
      blocks.push([formatCopy(take('c', PRAISE_CLOSERS), scoped)]);
      break;
    }

    /**
     * «إزاي الأخبار؟» — what was missed, and one question.
     *
     * The ORDER is the design and it is the opposite of the obvious one: the
     * facts come before the question, because a message that opens with «حصل
     * إيه؟» is an interrogation and one that opens with what was noticed is a
     * teacher who looked. And the lists come as at most two sentences, never
     * as a heading with bullets under it — see `FOLLOW_UP_LESSON_SINGLE` for
     * the reply that taught this file that lesson.
     */
    case 'follow_up': {
      const facts = input.facts;
      blocks.push([formatCopy(take('o', FOLLOW_UP_OPENERS), vars)]);

      const noticed: string[] = [];
      if (facts.missedLessons.length > 0) {
        const single = facts.missedLessons.length === 1;
        noticed.push(
          formatCopy(take(single ? 'l1' : 'l', single ? FOLLOW_UP_LESSON_SINGLE : FOLLOW_UP_LESSON_MANY), {
            ...vars,
            lessons: joinQuoted(facts.missedLessons),
          }),
        );
      }
      if (facts.missedQuizzes.length > 0) {
        const single = facts.missedQuizzes.length === 1;
        noticed.push(
          formatCopy(take(single ? 'q1' : 'q', single ? FOLLOW_UP_QUIZ_SINGLE : FOLLOW_UP_QUIZ_MANY), {
            ...vars,
            quizzes: joinQuoted(facts.missedQuizzes),
          }),
        );
      }
      // One block, so the two sentences sit on consecutive lines rather than
      // as two paragraphs — they are one observation said in two halves.
      if (noticed.length > 0) blocks.push(noticed);

      blocks.push([formatCopy(take('a', FOLLOW_UP_ASKS), vars)]);
      blocks.push([formatCopy(take('c', FOLLOW_UP_CLOSERS), vars)]);
      break;
    }

    /**
     * «كمّل رحلتك» — the account with no seat.
     *
     * The link goes at the END of the body block, exactly where the WhatsApp
     * invitation puts its own, so the closer that follows can point UP at the
     * card `MessageBody` draws from it.
     */
    case 'subscribe_nudge': {
      const facts = input.facts;
      const scoped = { ...vars, course: facts.courseTitle ?? '' };

      blocks.push([formatCopy(take('o', SUBSCRIBE_OPENERS), scoped)]);

      const body = [
        facts.courseTitle
          ? formatCopy(take('b', SUBSCRIBE_BODIES), scoped)
          : formatCopy(take('bu', SUBSCRIBE_BODIES_UNKNOWN), scoped),
        formatCopy(COURSE_LINK_LINE, { url: facts.url }),
      ];
      blocks.push(body);

      blocks.push([formatCopy(take('c', SUBSCRIBE_CLOSERS), scoped)]);
      break;
    }

    /**
     * «كمّل الدفع» — the payment step that was left open.
     *
     * Same shape as `subscribe_nudge`: what was noticed, the link alone on its
     * own line at the end of the middle block, and a closer that offers help
     * rather than pressure. The facts never say WHEN it was left: «من ٣
     * ساعات» is a line that reads as being watched.
     */
    case 'checkout_recovery': {
      const facts = input.facts;
      const scoped = { ...vars, title: facts.title ?? '' };
      blocks.push([
        facts.target === 'course' && facts.title
          ? formatCopy(take('o', CHECKOUT_COURSE_OPENERS), scoped)
          : formatCopy(take('ob', CHECKOUT_BOOK_OPENERS), scoped),
      ]);
      blocks.push([
        formatCopy(take('b', CHECKOUT_BODIES), scoped),
        formatCopy(COURSE_LINK_LINE, { url: facts.url }),
      ]);
      blocks.push([formatCopy(take('c', CHECKOUT_CLOSERS), scoped)]);
      break;
    }

    /** «الحساب جاهز» — the account that has bought nothing yet. */
    case 'signup_nudge': {
      const facts = input.facts;
      const scoped = { ...vars, course: facts.courseTitle ?? '' };
      blocks.push([
        facts.step === 2
          ? formatCopy(take('o2', SIGNUP_SECOND_OPENERS), scoped)
          : formatCopy(take('o', SIGNUP_OPENERS), scoped),
      ]);
      blocks.push([
        facts.courseTitle
          ? formatCopy(take('b', SIGNUP_BODIES), scoped)
          : formatCopy(take('bu', SIGNUP_BODIES_UNKNOWN), scoped),
        formatCopy(COURSE_LINK_LINE, { url: facts.url }),
      ]);
      blocks.push([formatCopy(take('c', SIGNUP_CLOSERS), scoped)]);
      break;
    }

    case 'referral_reward': {
      const scoped = { ...vars, amount: input.facts.amount };
      blocks.push([formatCopy(take('o', REFERRAL_REWARD_OPENERS), scoped)]);
      blocks.push([formatCopy(take('b', REFERRAL_REWARD_BODIES), scoped)]);
      blocks.push([formatCopy(take('c', REFERRAL_REWARD_CLOSERS), scoped)]);
      break;
    }

    case 'whatsapp_invite': {
      blocks.push([formatCopy(take('o', WHATSAPP_OPENERS), vars)]);
      const body = [formatCopy(take('b', WHATSAPP_BODIES), vars)];
      if (input.whatsappUrl) {
        body.push(formatCopy(WHATSAPP_LINK_LINE, { url: input.whatsappUrl }));
      }
      blocks.push(body);
      blocks.push([formatCopy(take('c', WHATSAPP_CLOSERS), vars)]);
      break;
    }
  }

  /*
   * The tagalong is appended to the three SWEPT kinds only.
   *
   * On a `whatsapp_invite` the channel is already the whole message, and
   * adding it again is how a message starts reading like an autoresponder.
   * The two manual kinds are excluded for a different reason: each of them
   * ends on ONE thing to press — a question to answer, or a course card —
   * and a second link under it splits the one action the message exists to
   * produce. `subscribe_nudge` would also draw two cards in one bubble.
   */
  if (wantsGroup && !NO_TAGALONG.has(input.facts.kind)) {
    const tail = [formatCopy(take('w', WHATSAPP_TAGALONGS), vars)];
    if (input.whatsappUrl) {
      tail.push(formatCopy(WHATSAPP_LINK_LINE, { url: input.whatsappUrl }));
    }
    blocks.push(tail);
  }

  return {
    variantKey: serializeVariantKey(chosen),
    body: blocks.map((lines) => lines.join('\n')).join('\n\n'),
  };
}

/**
 * The same topic, written into a sentence instead of onto a bullet.
 *
 * ⚠️ The topic NAME is dropped when it repeats what the opener already said.
 * `topic.name` arrives as a full path — «أساسيات البرمجة — المحاضرة الثانية»
 * — and the line above it already names the quiz, «كويز المحاضرة الثانية — إيه
 * هو الكمبيوتر؟». Printing both puts the same lecture in the message twice and
 * makes the correction read like a database row, which is exactly what the
 * student who could not understand hers was sent.
 *
 * What a student needs in order to act is the QUESTION NUMBER. The name is
 * kept only when it adds something the opener did not already say.
 */
function renderFocusInline(topic: OutreachTopic): string {
  const questions = topic.questionNumbers.join(QUESTION_NUMBER_SEPARATOR);
  const short = topic.name?.split('—').pop()?.trim();
  return short && !/محاضرة|الوحدة/u.test(short)
    ? formatCopy(FOCUS_SINGLE_NAMED, { topic: short, questions })
    : formatCopy(FOCUS_SINGLE_PLAIN, { questions });
}

function renderFocusItem(topic: OutreachTopic): string {
  const questions = topic.questionNumbers.join(QUESTION_NUMBER_SEPARATOR);
  return topic.name
    ? formatCopy(FOCUS_ITEM, { topic: topic.name, questions })
    : formatCopy(FOCUS_ITEM_UNTITLED, { questions });
}

/**
 * Lecture and quiz titles, each in Arabic quotation marks, joined the same way.
 *
 * The quotes are not decoration: a title like «الدرس الأول» dropped bare into
 * «المحاضرات دي لسه ما اتفتحتش: الدرس الأول، المراجعة» reads as prose and the
 * boundary between two titles disappears. Same reason every other pool here
 * writes «{quiz}» rather than {quiz}.
 */
function joinQuoted(items: readonly string[]): string {
  return joinArabic(items.map((title) => formatCopy(TITLE_QUOTE, { title })));
}

/**
 * «الحلقات و الشروط» — Arabic's «و» prefixes the last item and takes no comma
 * before it, which is why this is not `Intl.ListFormat`.
 */
function joinArabic(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(LIST_SEPARATOR)}${LIST_LAST_SEPARATOR}${items[items.length - 1]}`;
}

/**
 * Whether this message carries the WhatsApp group nudge.
 *
 * Three conditions, and all three matter:
 *
 *   · there is a link to give — without one the sentence sends the student to
 *     WhatsApp's own marketing page, which `WhatsappChannelCard` records the
 *     platform having shipped once already;
 *   · the PREVIOUS message did not carry it, so it can never appear twice in a
 *     row however the hash falls;
 *   · the hash says so, roughly one time in three.
 */
function shouldAddGroup(input: ComposeInput, history: readonly ParsedVariant[]): boolean {
  if (!input.whatsappUrl) return false;
  if (history[0] && 'w' in history[0]) return false;
  return hash(`${input.seed}:wa`) % GROUP_TAGALONG_ODDS === 0;
}

type ParsedVariant = Record<string, number>;

/**
 * Chooses an index the recent history has not used.
 *
 * Walks newest-first and blocks what it finds, stopping one short of the pool
 * size so a candidate always survives. That bound is the whole correctness
 * argument: with it the function is total, and the student cycles the pool
 * before repeating; without it a long history would block every index and
 * there would be nothing to return.
 */
function pickIndex(
  slot: string,
  poolSize: number,
  history: readonly ParsedVariant[],
  seed: number,
): number {
  if (poolSize <= 1) return 0;

  const blocked = new Set<number>();
  for (const entry of history) {
    if (blocked.size >= poolSize - 1) break;
    const used = entry[slot];
    if (used !== undefined && used >= 0 && used < poolSize) blocked.add(used);
  }

  const candidates: number[] = [];
  for (let index = 0; index < poolSize; index += 1) {
    if (!blocked.has(index)) candidates.push(index);
  }

  return candidates[seed % candidates.length]!;
}

/** `g=2|o=4|s.weak=1`. Sorted, so the same choices always serialize alike. */
function serializeVariantKey(chosen: ReadonlyMap<string, number>): string {
  return [...chosen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slot, index]) => `${slot}=${index}`)
    .join('|');
}

/**
 * Tolerant by design: these strings come out of a database column that older
 * builds wrote and newer ones will extend, and a history entry that cannot be
 * parsed should cost variety, never throw inside a grading transaction.
 */
export function parseVariantKey(key: string): ParsedVariant {
  const parsed: ParsedVariant = {};
  for (const pair of key.split('|')) {
    const separator = pair.lastIndexOf('=');
    if (separator <= 0) continue;
    const index = Number.parseInt(pair.slice(separator + 1), 10);
    if (Number.isInteger(index)) parsed[pair.slice(0, separator)] = index;
  }
  return parsed;
}

/** FNV-1a, 32-bit. Small, stable across runtimes, and not a security control. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}
