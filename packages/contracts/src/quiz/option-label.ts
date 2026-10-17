/**
 * What a teacher TYPES into an option, versus what the paper needs.
 *
 * ## The letters inside the option
 *
 * Teachers copy questions out of a book or a Word file, so the letter comes
 * along with the text: «أ) siri», «[ب] لا.», «A. True». The runner already
 * draws its own letter beside every option (`optionLetter`), so a lettered
 * option reads «أ  ب) siri» — and once the options are shuffled the two
 * letters disagree, which is worse than a duplicate: a student told in class
 * «الإجابة ب» picks the row whose TEXT says ب, under a different letter.
 * Measured on 2026-10-17: 25 live questions on one teacher's stack were
 * lettered like that.
 *
 * ## The options that point at other options
 *
 * «أ و د معا», «كل ما سبق», «لا شيء مما سبق», «all of the above». They are
 * written against the order the teacher typed, and a shuffle breaks them:
 * «أ و د معا» names two rows that, on a student's screen, are now some other
 * two. The same measurement found 23 such questions; on one of them, 129 of
 * 173 students picked the option the teacher's «أ» had meant.
 *
 * A question that does either is served in the order it was written
 * (`keepsWrittenOrder`), and its typed letters are taken off
 * (`stripOptionLabels`) — the runner's own letter is then the teacher's
 * letter, because the order is the teacher's order.
 *
 * Pure functions on the stored HTML, so the API applies them to rows written
 * long before this file existed — nothing in the bank has to be rewritten for
 * the fix to reach them.
 */

/** Leading wrapper tags (`<p>`, `<p dir="rtl"><strong>`) before the first text. */
const LEADING_TAGS = /^(\s*(?:<[^>]+>\s*)*)/;

/**
 * A typed option label at the very start of the text, capturing the letter.
 *
 * - Arabic option letters or Latin A–J, optionally wrapped in ( ) or [ ],
 *   then ) ] . : - or –.
 * - Digits ONLY with a closing ) or ] («1)», «(٢)», «[3]»): «5 - 3» is an
 *   answer to a subtraction, not a label.
 * - `.`, `:` and the dashes must be followed by whitespace: «A.B» and «x:y»
 *   are code and ratios far more often than they are labels.
 */
const LABEL =
  /^[([]?\s*(?:([أاإبجدهوزحطي])ـ?|([A-Ja-j]))\s*(?:[)\]]\s*|[.:\-–]\s+)|^[([]?\s*([0-9٠-٩])\s*[)\]]\s*/u;

/** The order Egyptian papers letter their options in: أ ب ج د هـ و ز ح ط ي. */
const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط', 'ي'];
const LATIN_LETTERS = 'abcdefghij';
const ARABIC_DIGITS = '١٢٣٤٥٦٧٨٩';

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

interface Label {
  /** Where the label ends, in the string AFTER the leading tags. */
  length: number;
  /** 0 for أ / A / 1, 1 for ب / B / 2 … */
  index: number;
}

function readLabel(html: string): { lead: string; label: Label | null } {
  const lead = LEADING_TAGS.exec(html)?.[1] ?? '';
  const match = LABEL.exec(html.slice(lead.length));
  if (!match) return { lead, label: null };
  const [whole, arabic, latin, digit] = match;
  let index = -1;
  if (arabic) index = ARABIC_LETTERS.indexOf(arabic === 'ا' || arabic === 'إ' ? 'أ' : arabic);
  else if (latin) index = LATIN_LETTERS.indexOf(latin.toLowerCase());
  else if (digit) {
    const western = /[0-9]/.test(digit) ? Number(digit) : ARABIC_DIGITS.indexOf(digit) + 1;
    index = western - 1;
  }
  return { lead, label: index >= 0 ? { length: whole.length, index } : null };
}

/**
 * True when the teacher lettered the options themselves, in order.
 *
 * Two or more options must carry a label, and every label must name its own
 * row («أ» first, «ب» second…). The sequence is what tells a lettering scheme
 * from an option that merely starts like one — «C. Babbage» first in a list
 * of inventors is a name, not the third option.
 */
export function isLetteredSet(bodies: readonly string[]): boolean {
  let labelled = 0;
  for (const [index, body] of bodies.entries()) {
    const { label } = readLabel(body);
    if (!label) continue;
    if (label.index !== index) return false;
    labelled += 1;
  }
  return labelled >= 2;
}

/**
 * The options without the letters the teacher typed in front of them.
 *
 * Only for a lettered set (`isLetteredSet`), so a lone «A. Turing» is left
 * alone; keeps wrapper tags; and never strips an option down to nothing —
 * an option that is ONLY «أ)» stays as it is, since a blank row is worse to
 * put in front of a student than a stray letter.
 */
export function stripOptionLabels(bodies: readonly string[]): string[] {
  if (!isLetteredSet(bodies)) return [...bodies];
  return bodies.map((body) => {
    const { lead, label } = readLabel(body);
    if (!label) return body;
    const rest = body.slice(lead.length + label.length);
    return stripTags(rest).trim() === '' ? body : lead + rest;
  });
}

/**
 * Text for COMPARING two options — across versions of one question, never
 * for display. Tags, a leading label, tashkeel and tatweel go; the letters
 * Egyptian typing mixes up (أ/إ/آ/ا, ى/ي, ة/ه) are folded; whitespace
 * collapses; Latin is lower-cased. «أ) تحيز بيانات التدريب» and
 * «تحيز  بيانات التدريب» compare equal, which is the point.
 */
export function normalizeOptionText(html: string): string {
  const { lead, label } = readLabel(html);
  const unlabelled = label ? lead + html.slice(lead.length + label.length) : html;
  return stripTags(unlabelled)
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Phrases that only make sense against the order the options were written in.
 * Matched against `normalizeOptionText`, so the letters are already folded.
 *
 * Deliberately narrow. «لا شيء» on its own is an ordinary answer, and
 * «a + b» is an expression, not a reference; matching either would freeze
 * the order of questions that are fine shuffled. Latin letter pairs only
 * count with a word that makes them a reference («both A and B»).
 */
const CROSS_REFERENCE: readonly RegExp[] = [
  /(?:كل|جميع)\s*(?:ما|مما)\s*سبق/u,
  /(?:كل|جميع)\s*(?:الاجابات|الاختيارات)/u,
  /لا\s*(?:شيء|شئ|شي)\s*(?:مما|من\s*ما|من)\s*(?:سبق|السابق)/u,
  /ليس\s*(?:مما|من\s*ما)\s*سبق/u,
  /كلاهما|كلتاهما|(?:الاثنين|الاتنين|الاثنان)\s*معا/u,
  // «ا و د معا», «ا , ب معا», «ج و ب» — two or more option letters joined.
  /(?:^|[\s(])[ابجده]\s*[,،و&+]\s*[ابجده](?:\s*[,،و&+]\s*[ابجده])*\s*(?:معا|فقط|كلاهما)?\s*(?:$|[\s).])/u,
  /\ball of the above\b/,
  /\bnone of the above\b/,
  /\bboth\s+[a-d]\s+and\s+[a-d]\b/,
  /\b[a-d]\s*(?:and|&|,)\s*[a-d]\s+(?:only|both|together|are correct)\b/,
];

/** True when the option refers to other options by position or by letter. */
export function isCrossReferenceOption(html: string): boolean {
  const text = normalizeOptionText(html);
  return CROSS_REFERENCE.some((pattern) => pattern.test(text));
}

/**
 * Should this question be served in the order the teacher wrote it?
 *
 * Yes when any option points at the others, or when the teacher lettered the
 * options themselves. `bodies` must be in the WRITTEN order (by position).
 * Ordering questions never ask: their stored order IS the answer.
 */
export function keepsWrittenOrder(bodies: readonly string[]): boolean {
  return bodies.some(isCrossReferenceOption) || isLetteredSet(bodies);
}
