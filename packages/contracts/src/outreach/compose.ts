import { formatCopy } from '@ayman/contracts/format';
import {
  FOCUS_INTROS,
  FOCUS_ITEM,
  FOCUS_ITEM_UNTITLED,
  FOCUS_TAILS,
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
  STRENGTH_LINES,
  WHATSAPP_BODIES,
  WHATSAPP_CLOSERS,
  WHATSAPP_LINK_LINE,
  WHATSAPP_OPENERS,
  WHATSAPP_TAGALONGS,
  type OutreachBand,
} from '@ayman/contracts/copy/outreach';

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
  | { kind: 'whatsapp_invite' };

export interface ComposeInput {
  /** The student's first name. `firstNameOf` derives it from the account name. */
  firstName: string;
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
/** Naming five things someone is good at reads as filler, not praise. */
const MAX_STRENGTH_TOPICS = 2;

/**
 * One in three messages carries the group nudge — enough that a student who
 * has not joined keeps being asked, rare enough that it does not become the
 * thing every message is really about. Never twice in a row; see `wantsGroup`.
 */
const GROUP_TAGALONG_ODDS = 3;

export function bandFor(scorePercent: number): OutreachBand {
  if (scorePercent >= BAND_EXCELLENT) return 'excellent';
  if (scorePercent >= BAND_STRONG) return 'strong';
  if (scorePercent >= BAND_FAIR) return 'fair';
  return 'weak';
}

/**
 * «محمد أحمد السيد» → «محمد»، and «MARAWAN» → «Marawan».
 *
 * A message that opens with someone's full three-part name is a bank letter.
 * Falls back to the whole string when there is no space, and to an empty
 * string for an empty name — the greeting pools all tolerate `{name}` being
 * blank better than they tolerate the word "undefined".
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
  const first = fullName.trim().split(/\s+/u)[0] ?? '';
  const shouting = /\p{Lu}/u.test(first) && !/\p{Ll}/u.test(first);
  // Per LETTER RUN, so «ANNE-MARIE» and «O'BRIEN» keep the capital after the
  // separator rather than becoming «Anne-marie».
  return shouting ? first.replace(/\p{L}+/gu, (run) => run[0] + run.slice(1).toLowerCase()) : first;
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

  const vars: Record<string, string | number> = { name: input.firstName };
  const blocks: string[][] = [[formatCopy(take('g', OUTREACH_GREETINGS), vars)]];

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
      if (weak.length > 0) {
        blocks.push([
          take('f', FOCUS_INTROS),
          ...weak.map((topic) => renderFocusItem(topic)),
        ]);
        blocks.push([take('t', FOCUS_TAILS)]);
      }

      const strong = facts.strongTopics.slice(0, MAX_STRENGTH_TOPICS);
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
   * The tagalong is appended to the OTHER three kinds only. On a
   * `whatsapp_invite` the group is already the whole message, and adding it
   * again is how a message starts reading like an autoresponder.
   */
  if (wantsGroup && input.facts.kind !== 'whatsapp_invite') {
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

function renderFocusItem(topic: OutreachTopic): string {
  const questions = topic.questionNumbers.join(QUESTION_NUMBER_SEPARATOR);
  return topic.name
    ? formatCopy(FOCUS_ITEM, { topic: topic.name, questions })
    : formatCopy(FOCUS_ITEM_UNTITLED, { questions });
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
