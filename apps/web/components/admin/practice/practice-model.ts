import { arabicCount } from '@ayman/contracts/arabic-count';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import {
  PracticeQuestionInputSchema,
  type AdminPracticeSetRow,
  type PracticeQuestion,
  type PracticeQuestionInput,
  type PracticeQuestionType,
  type PracticeTrack,
  type PracticeYear,
} from '@ayman/contracts/practice';
import { parseQuestionBlocks } from '@ayman/contracts/quiz/import';
import { htmlToPlainText } from '@ayman/contracts/quiz/rich-text';

/**
 * «اختبارات مجانية» on the dashboard — everything here that is not a
 * component: grouping the list, the editor's draft and its validation, and
 * the paste → batch mapping.
 *
 * No directive and no server import, so the page (a Server Component), the
 * client editor and the tests all read the same functions.
 */

// ── the list ─────────────────────────────────────────────────────────────

/**
 * The public URL. Written out here rather than imported from
 * `lib/practice/catalog.ts`: that module is `'use cache'` loaders over
 * `next/cache`, and a client card importing `practicePath` from it would pull
 * the loaders into the browser bundle for one template string.
 */
export function publicPracticeHref(year: PracticeYear, track: PracticeTrack, lessonCode: string): string {
  return `/practice/${year}/${track}/${lessonCode}`;
}

/** «2-1» → 2. The contract's regex guarantees the shape; 0 is the fallback for a row that predates it. */
export function unitOf(lessonCode: string): number {
  const unit = Number(lessonCode.split('-')[0]);
  return Number.isFinite(unit) ? unit : 0;
}

function lessonOf(lessonCode: string): number {
  const lesson = Number(lessonCode.split('-')[1]);
  return Number.isFinite(lesson) ? lesson : 0;
}

/** Numeric, not lexical: «2-10» comes after «2-9», where a string sort puts it after «2-1». */
export function compareLessonCodes(a: string, b: string): number {
  return unitOf(a) - unitOf(b) || lessonOf(a) - lessonOf(b);
}

export interface PracticeUnitGroup {
  unit: number;
  /** The first non-empty `unitTitle` among its lessons, else null — the heading falls back to «الوحدة N». */
  unitTitle: string | null;
  rows: AdminPracticeSetRow[];
}

export interface PracticeShelf {
  year: PracticeYear;
  track: PracticeTrack;
  units: PracticeUnitGroup[];
}

/**
 * Year → track → unit, each in reading order. One shelf per year·track, because
 * «تانية · عربي · 2-1» and «تانية · لغات · 2-1» are two different sets with the
 * same code, and mixing them under one «الوحدة 2» heading would put two cards
 * with the same chip side by side.
 */
export function shelvesOf(rows: readonly AdminPracticeSetRow[]): PracticeShelf[] {
  const shelves = new Map<string, PracticeShelf>();
  const sorted = [...rows].sort(
    (a, b) =>
      a.year - b.year ||
      (a.track === b.track ? 0 : a.track === 'arabic' ? -1 : 1) ||
      compareLessonCodes(a.lessonCode, b.lessonCode),
  );
  for (const row of sorted) {
    const key = `${row.year}:${row.track}`;
    let shelf = shelves.get(key);
    if (!shelf) {
      shelf = { year: row.year, track: row.track, units: [] };
      shelves.set(key, shelf);
    }
    const unit = unitOf(row.lessonCode);
    let group = shelf.units.find((candidate) => candidate.unit === unit);
    if (!group) {
      group = { unit, unitTitle: null, rows: [] };
      shelf.units.push(group);
    }
    if (!group.unitTitle && row.unitTitle) group.unitTitle = row.unitTitle;
    group.rows.push(row);
  }
  return [...shelves.values()];
}

/**
 * A decorative hue per unit, from the same ramp the bank's categories use —
 * spaced by the golden angle so neighbouring units never land on neighbouring
 * hues, and kept off green (≈140–160, the correct answer) and red (≈20–30,
 * delete), which are spoken for on these screens.
 */
export function unitHue(unit: number): number {
  const raw = Math.round((unit * 137.508 + 250) % 360);
  if (raw >= 125 && raw <= 170) return raw + 60;
  if (raw <= 35 || raw >= 345) return (raw + 60) % 360;
  return raw;
}

// ── the editor's draft ───────────────────────────────────────────────────

/** What the form holds while it is being typed — looser than the contract on purpose. */
export interface QuestionDraft {
  type: PracticeQuestionType;
  stem: string;
  /** mcq only; the tf branch ignores it. Kept across a type switch so flipping back loses nothing. */
  options: string[];
  /** null = not chosen yet, which the form must say rather than default to «أ». */
  answer: number | null;
  explanation: string;
}

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export function emptyDraft(type: PracticeQuestionType = 'mcq'): QuestionDraft {
  return { type, stem: '', options: ['', '', '', ''], answer: null, explanation: '' };
}

export function draftFromQuestion(question: PracticeQuestion): QuestionDraft {
  return {
    type: question.type,
    stem: question.stem,
    options: question.type === 'mcq' ? [...question.options] : ['', '', '', ''],
    answer: question.answer,
    explanation: question.explanation,
  };
}

export type DraftField = 'stem' | 'options' | 'answer' | 'explanation';
export type DraftErrors = Partial<Record<DraftField, string>>;

export type DraftCheck = { ok: true; input: PracticeQuestionInput } | { ok: false; errors: DraftErrors };

/**
 * The contract's own rules, said in Arabic per field.
 *
 * Blank mcq rows are DROPPED before counting, not reported: the form opens
 * with four rows and a two-option question should not need two removals — but
 * the answer is re-pointed through the drop, so a key on «ج» with «ب» left
 * blank stays on the same text rather than sliding onto the next row.
 */
export function checkDraft(draft: QuestionDraft): DraftCheck {
  const errors: DraftErrors = {};
  const e = c.question.errors;
  const stem = draft.stem.trim();
  if (stem.length < 3) errors.stem = e.stem;
  else if (stem.length > 1000) errors.stem = e.stemLong;

  let options: string[] = [];
  let answer = draft.answer;
  if (draft.type === 'mcq') {
    const kept: number[] = [];
    draft.options.forEach((option, index) => {
      if (option.trim() !== '') kept.push(index);
    });
    options = kept.map((index) => draft.options[index]!.trim());
    answer = draft.answer === null ? null : kept.indexOf(draft.answer);
    if (answer === -1) answer = null;

    if (options.length < MIN_OPTIONS) errors.options = e.optionsCount;
    else if (options.some((option) => option.length > 400)) errors.options = e.optionLong;
    else if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) errors.options = e.distinct;

    if (answer === null) errors.answer = e.answer;
  } else if (answer !== 0 && answer !== 1) {
    errors.answer = e.answer;
  }

  if (draft.explanation.trim().length > 1500) errors.explanation = e.explanationLong;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = PracticeQuestionInputSchema.safeParse({
    type: draft.type,
    stem,
    options: draft.type === 'mcq' ? options : [],
    answer,
    explanation: draft.explanation.trim(),
  });
  // Unreachable while the checks above mirror the contract — kept so a rule
  // added to the schema and not here fails visibly instead of 400ing.
  if (!parsed.success) return { ok: false, errors: { stem: parsed.error.issues[0]?.message ?? e.stem } };
  return { ok: true, input: parsed.data };
}

// ── «لصق أسئلة كتير» ───────────────────────────────────────────────────────

export type PasteBlock =
  | { index: number; ok: true; question: PracticeQuestionInput }
  | { index: number; ok: false; message: string };

/**
 * The question bank's Aiken superset (`parseQuestionBlocks`), narrowed to what
 * a practice set can hold, one entry PER BLOCK so the preview can put each
 * error beside the paragraph it belongs to.
 *
 * ## Why the blocks are re-split here
 *
 * The parser returns its questions and its errors in two flat lists: a block
 * that parsed is in the first, one that did not is in the second under its
 * `blockIndex`. Splitting the text with the parser's exact rule and walking the
 * blocks in order puts them back together — a block with an error consumes no
 * question, every other block consumes the next one.
 *
 * ## What is narrowed
 *
 * `mcq_single` → `mcq` (the one full-credit option is the answer) and
 * `true_false` → `tf` (0 when the keyed option is «صح»/True). Everything else
 * the bank accepts — several right answers, short answer, essay, ordering —
 * is a per-block error, never a silent drop: a paste of forty that lands as
 * thirty-eight is a set missing two questions nobody knows about.
 */
export function parsePastedQuestions(text: string): PasteBlock[] {
  const blocks = text
    .replaceAll('\r\n', '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.split('\n').filter((line) => line.trim() !== ''))
    .filter((lines) => lines.length > 0);
  if (blocks.length === 0) return [];

  // The bank's parser wants a category; nothing here reads it back.
  const result = parseQuestionBlocks(text, 'practice');
  const errorsByBlock = new Map<number, string>();
  for (const error of result.errors) {
    if (!errorsByBlock.has(error.blockIndex)) errorsByBlock.set(error.blockIndex, error.message);
  }

  let next = 0;
  return blocks.map((_, position): PasteBlock => {
    const index = position + 1;
    const error = errorsByBlock.get(index);
    if (error !== undefined) return { index, ok: false, message: error };
    const parsed = result.questions[next++];
    if (!parsed) return { index, ok: false, message: c.paste.unsupported };
    return toPracticeBlock(index, parsed);
  });
}

type BankQuestion = ReturnType<typeof parseQuestionBlocks>['questions'][number];

const TRUE_BODIES = new Set(['صح', 'صحيح', 'true']);

function toPracticeBlock(index: number, bank: BankQuestion): PasteBlock {
  if (bank.type !== 'mcq_single' && bank.type !== 'true_false') {
    return { index, ok: false, message: c.paste.unsupported };
  }
  const options = bank.options.map((option) => htmlToPlainText('bodyHtml' in option ? option.bodyHtml : ''));
  const keyed = bank.options.findIndex((option) => option.fraction === 1);
  const stem = htmlToPlainText(bank.stemHtml);
  const explanation = bank.generalFeedbackHtml ? htmlToPlainText(bank.generalFeedbackHtml) : '';

  let candidate: unknown;
  if (bank.type === 'true_false') {
    const keyedBody = (options[keyed] ?? '').trim().toLowerCase();
    candidate = { type: 'tf', stem, options: [], answer: TRUE_BODIES.has(keyedBody) ? 0 : 1, explanation };
  } else {
    if (options.length > MAX_OPTIONS) return { index, ok: false, message: c.paste.tooManyOptions };
    candidate = { type: 'mcq', stem, options, answer: keyed, explanation };
  }

  const parsed = PracticeQuestionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    const e = c.question.errors;
    const tooBig = issue?.code === 'too_big';
    const message =
      field === 'stem'
        ? tooBig ? e.stemLong : e.stem
        : field === 'options'
          ? tooBig ? e.optionLong : e.distinct
          : field === 'explanation'
            ? e.explanationLong
            : e.answer;
    return { index, ok: false, message };
  }
  return { index, ok: true, question: parsed.data };
}

/** «فقرة 3» — the label the preview prints beside a block. */
export function blockLabel(index: number): string {
  return formatCopy(c.paste.block, { n: index });
}

/** «سؤال واحد»، «سؤالين»، «3 أسئلة»، «20 سؤال». */
export function questionCount(n: number): string {
  return arabicCount(n, c.counts.questions);
}
