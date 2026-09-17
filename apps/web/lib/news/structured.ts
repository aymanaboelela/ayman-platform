import { headingId, inlineText, type InlineNode, type MarkdownBlock } from '@/lib/news/markdown';

/**
 * Structured data DERIVED from an article's own body.
 *
 * ## Why this exists
 *
 * The «نيوز» section is where this site's real answers live. Thirty-two
 * articles, every one of them written as a question a student actually types —
 * «الفرق بين أولى وتانية بكالوريا», «قاموس المصطلحات», «نماذج أسئلة
 * بالإجابات». All of it reaches a crawler as `<h2>` + `<p>` + `<ul>`, which is
 * to say: as prose an assistant has to *infer* the shape of.
 *
 * That inference is exactly what this file removes. The same argument
 * `faqPageJsonLd` already makes for the `/about` FAQ — "same words, no
 * ambiguity, and the extraction survives the markup being restyled" — applies
 * with far more force here, because these pages carry a hundred definitions
 * and a bank of exam questions with their answer key, and none of it was
 * labelled as anything but text.
 *
 * ⚠️ Nothing here INVENTS content. Every string returned is lifted verbatim
 * from the block tree the page renders, so the structured data and the visible
 * page can never disagree. That is not a nicety: an `Answer` whose text is not
 * on the page is the one structured-data failure that is worse than emitting
 * none, and it is the rule `faqPageJsonLd` already warns about.
 *
 * ⚠️ These are HEURISTICS over author-written markdown, not a schema the
 * editor enforces. All three are therefore deliberately conservative — they
 * would rather return nothing than describe a bullet list as a glossary or an
 * ordinary numbered list as an exam. The thresholds and the shape tests below
 * are where that caution lives; each carries the note for why it is set where
 * it is, and each was tuned against the thirty-two articles actually published
 * on 2026-09-15 rather than against an invented sample.
 */

/** Exactly the shape `faqPageJsonLd` takes, so the rows go straight in. */
export interface DerivedFaqRow {
  questionAr: string;
  answerAr: string;
}

/**
 * `definedTermSetJsonLd`'s term shape plus the anchor this term sits under.
 * The url is carried on the term rather than recomputed by the caller because
 * it depends on the heading the bullet appeared beneath, which only this walk
 * knows.
 */
export interface DerivedTerm {
  ar: string;
  en: string;
  body: string;
  url: string;
}

/**
 * One practice question. `options` is empty for an essay question — the
 * distinction survives to the JSON-LD, where only a multiple-choice question
 * may carry `suggestedAnswer`.
 */
export interface DerivedQuestion {
  question: string;
  options: string[];
  /** Index into `options`; -1 when there are none (an essay answer). */
  answerIndex: number;
  answer: string;
}

/**
 * ⚠️ A single question-shaped heading in a twenty-heading article is far more
 * likely to be a rhetorical section title than an FAQ. Two is the point where
 * the author was clearly writing question/answer pairs, and it is what keeps
 * «ليه المادة دي مناسبة للأونلاين؟» — one question among eight statements —
 * from publishing a one-entry FAQPage for the whole article.
 */
const MIN_FAQ_ROWS = 2;

/**
 * ⚠️ Same reasoning, harder threshold. The `**عربي English**: تعريف` bullet is
 * a real pattern in the glossary and in all four unit summaries, and it is also
 * what a single «- **الترتيب الصحيح**: AI > ML > DL» bullet can look like from
 * a distance. Five in one document is an author keeping a vocabulary list; one
 * or two is a coincidence.
 */
const MIN_TERMS = 5;

/**
 * ⚠️ A `Quiz` is a claim that this page is a practice set. Three questions is
 * the floor at which that is true rather than incidental — and every article
 * that genuinely has a question bank has twenty-five.
 */
const MIN_QUESTIONS = 3;

/** `؟` (U+061F) is the one that actually appears; `?` is here for a pasted heading. */
const QUESTION_MARK = /[؟?]\s*$/;

/**
 * The em/en dash form of a glossary bullet: `**شبكات التواصل — SNS**`.
 * The ASCII hyphen is deliberately NOT accepted — it appears inside ordinary
 * Arabic prose and inside English names («Man-in-the-Middle»), so accepting it
 * would turn half the bullets in an article into fake glossary terms.
 */
const DASHED_TERM = /^(.*\S)\s*[—–]\s*(\S.*)$/;

/**
 * The undashed form, which the unit summaries use: `**جدار الحماية Firewall**`
 * — the English name simply trails the Arabic one.
 *
 * ⚠️ The match is anchored to the END of the bold run and must be Latin the
 * whole way. That is what separates «جدار الحماية Firewall» from
 * «الترتيب الصحيح من الأوسع للأكثر تخصصًا», which ends in Arabic and is not a
 * term at all. A bold run that is Latin from its first character — `VPN`,
 * `DMZ`, `2FA` — matches with an empty Arabic side, which is correct: the term
 * genuinely has no Arabic name in the book.
 */
const TRAILING_LATIN = /^(.*?)\s*([A-Za-z][A-Za-z0-9 ()/&.'’+-]*)$/;

/**
 * ⚠️ The book writes the English name parenthesised as often as not —
 * `**شبكات التواصل الاجتماعي (SNS)**`. `TRAILING_LATIN` anchors on the first
 * LATIN character, so the opening bracket is left on the Arabic side and the
 * closing one on the English: «شبكات التواصل الاجتماعي (» and «SNS)». Both
 * halves are then wrong, and wrong in a way that publishes cleanly. Undoing the
 * split is one rule rather than a smarter regex, because the same bracket may
 * legitimately appear inside a name — `Augmented Reality (AR)` — where it is
 * balanced and must survive.
 */
const unbracket = (ar: string, en: string): { ar: string; en: string } =>
  ar.endsWith('(') && en.endsWith(')')
    ? { ar: ar.slice(0, -1).trim(), en: en.slice(0, -1).trim() }
    : { ar, en };

/**
 * What introduces a definition after the term. The colon is the common one;
 * the unit summaries use an em-dash and `**HTTPS** = HTTP فوق TLS` uses an
 * equals sign. The ASCII hyphen is NOT stripped — a definition may legitimately
 * open with a minus sign, and no article uses it as a separator.
 */
const DEFINITION_LEAD = /^\s*[:：=—–]\s*/;

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

/**
 * `(أ) … (ب) … (ج) … (د)` — the multiple-choice markers, exactly as the book
 * writes them. `هـ` is included because a five-option question is legal even
 * though none is published today; a marker the split does not know becomes
 * part of the previous option's text, which is silent and wrong.
 */
const OPTION_MARKER = /\s*\((أ|ب|ج|د|هـ)\)\s*/g;
const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ'] as const;

/** `**الإجابات**: 1-ج · 2-ب · 3-ب` — the key that follows a block of questions. */
const ANSWER_KEY_LABEL = 'الإجابات';
const ANSWER_KEY_ENTRY = /(\d+)\s*[-–—]\s*(هـ|[أبجد])/g;

/** `**س1: وضّح العلاقة…**` followed by `ج: …` — the essay pair. */
const ESSAY_QUESTION = /^س\s*\d+\s*[:：]\s*(\S.*)$/;
const ESSAY_ANSWER = /^\s*ج\s*[:：]\s*(\S[\s\S]*)$/;

/** The visible text of a run of inline nodes. */
const flatten = (nodes: readonly InlineNode[]): string =>
  nodes
    .map((node) => node.value)
    .join('')
    .trim();

/**
 * Question/answer pairs, taken from `## …؟` headings and everything under them.
 *
 * The answer is every block between that heading and the next one, joined —
 * paragraphs as sentences, list items as their own lines, quotes as prose.
 *
 * ⚠️ Deliberately NOT truncated, though the temptation is real on a long
 * section. A shortened answer is a different string from the one the page
 * shows, which is precisely the mismatch this whole file is built to avoid;
 * and the part that would be cut is the part an assistant grounds the second
 * half of its answer on. Page weight is the cost, and it is paid in gzipped
 * text that is already on the page once.
 */
export function faqRowsFromBlocks(blocks: readonly MarkdownBlock[]): DerivedFaqRow[] {
  const rows: DerivedFaqRow[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block || block.kind !== 'heading') continue;

    const question = inlineText(block.text).trim();
    if (!QUESTION_MARK.test(question)) continue;

    const answer: string[] = [];
    for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
      const next = blocks[cursor];
      if (!next || next.kind === 'heading') break;

      if (next.kind === 'paragraph' || next.kind === 'quote') {
        answer.push(flatten(next.text));
        continue;
      }
      if (next.kind === 'list') {
        for (const item of next.items) answer.push(flatten(item));
        continue;
      }
      // A fenced code block is skipped rather than pasted in: an `Answer.text`
      // carrying raw source reads as garbage wherever it is quoted, and the
      // prose around it already says what the code demonstrates.
    }

    const answerAr = answer.filter(Boolean).join(' ').trim();
    if (answerAr.length > 0) rows.push({ questionAr: question, answerAr });
  }

  return rows.length >= MIN_FAQ_ROWS ? rows : [];
}

/** Splits a bold run into its Arabic and English halves, or null if it is not a term. */
function splitTerm(bold: string): { ar: string; en: string } | null {
  const dashed = DASHED_TERM.exec(bold);
  if (dashed) {
    const ar = (dashed[1] ?? '').trim();
    const en = (dashed[2] ?? '').trim();
    // Both halves must be what they claim. «الوحدة الأولى — تكنولوجيا
    // المعلومات» is two Arabic phrases and a section label, not a term.
    if (ARABIC.test(ar) && LATIN.test(en)) return { ar, en };
    return null;
  }

  const trailing = TRAILING_LATIN.exec(bold);
  if (!trailing) return null;
  const { ar, en } = unbracket((trailing[1] ?? '').trim(), (trailing[2] ?? '').trim());
  // A one-character trailing token is a stray initial, not a name.
  if (en.length < 2) return null;
  // Either an Arabic name with its English one, or an English-only term. A
  // bold run with neither is prose.
  if (ar.length > 0 && !ARABIC.test(ar)) return null;
  return { ar, en };
}

/**
 * Glossary terms, taken from `- **عربي — English**: تعريف` bullets and from the
 * undashed `- **عربي English**: تعريف` and `- **عربي (English)** — تعريف` forms
 * the unit summaries and lesson explainers use.
 *
 * `url` points at the heading the bullet sits under — `#الدرس-2-2:-تصميم-أمان-الشبكات-18`
 * — computed with the same `headingId(text, blockIndex)` the rendered `<h2>`
 * uses, so every `DefinedTerm.url` is an anchor that actually exists. Getting
 * this wrong is silent: the markup validates and every link in it lands at the
 * top of the page.
 */
export function termsFromBlocks(
  blocks: readonly MarkdownBlock[],
  articlePath: string,
): DerivedTerm[] {
  const terms: DerivedTerm[] = [];
  /** The last heading seen — terms before any heading anchor to the page itself. */
  let anchor = '';

  blocks.forEach((block, index) => {
    if (block.kind === 'heading') {
      anchor = `#${headingId(inlineText(block.text), index)}`;
      return;
    }
    if (block.kind !== 'list') return;

    for (const item of block.items) {
      const [first, ...rest] = item;
      // The term must be the bolded head of the bullet. A bullet whose bold
      // run starts mid-sentence is prose that happens to emphasise a phrase.
      if (!first || first.kind !== 'strong') continue;

      const split = splitTerm(first.value.trim());
      if (!split) continue;

      // Everything after the bold run, with the colon that introduced it
      // removed — «: منصات تربط المستخدمين…» becomes the definition alone.
      const body = rest
        .map((node) => node.value)
        .join('')
        .replace(DEFINITION_LEAD, '')
        .trim();
      // No definition, no term. A bold phrase followed by nothing is a label.
      if (body.length === 0) continue;

      terms.push({ ...split, body, url: `${articlePath}${anchor}` });
    }
  });

  return terms.length >= MIN_TERMS ? terms : [];
}

/** `1-ج · 2-ب · 3-ب` → `[2, 1, 1]`, indexes into the option list. */
function parseAnswerKey(text: string): Map<number, number> {
  const key = new Map<number, number>();
  for (const match of text.matchAll(ANSWER_KEY_ENTRY)) {
    const number = Number(match[1]);
    const letter = OPTION_LETTERS.indexOf((match[2] ?? '') as (typeof OPTION_LETTERS)[number]);
    if (Number.isFinite(number) && letter >= 0) key.set(number, letter);
  }
  return key;
}

/**
 * The practice questions on an article, both shapes the question banks use.
 *
 * ## Multiple choice
 *
 * A numbered list whose items carry `(أ) … (ب) … (ج) … (د)`, followed — before
 * the next heading — by a paragraph beginning `**الإجابات**: 1-ج · 2-ب · …`.
 *
 * ⚠️ A question is emitted ONLY when the key names its number. A question
 * without its answer is the one thing this must never publish: an assistant
 * reading `Question` with no `acceptedAnswer` will answer it from its own
 * guess and attribute the guess to this site.
 *
 * ## Essay
 *
 * `**س1: نص السؤال.**` and `ج: الإجابة…` sit on consecutive lines with no
 * blank between them, so the parser has already joined them into ONE paragraph
 * whose first node is the bolded question. That is why this reads a paragraph
 * rather than a heading — and why it is robust: the two halves cannot drift
 * apart into different blocks without the rendered page changing too.
 */
export function questionsFromBlocks(blocks: readonly MarkdownBlock[]): DerivedQuestion[] {
  const questions: DerivedQuestion[] = [];

  blocks.forEach((block, index) => {
    if (block.kind === 'paragraph') {
      const [first, ...rest] = block.text;
      if (!first || first.kind !== 'strong') return;

      const stem = ESSAY_QUESTION.exec(first.value.trim());
      if (!stem) return;
      const answer = ESSAY_ANSWER.exec(flatten(rest));
      if (!answer) return;

      questions.push({
        question: (stem[1] ?? '').trim(),
        options: [],
        answerIndex: -1,
        answer: (answer[1] ?? '').trim(),
      });
      return;
    }

    if (block.kind !== 'list' || !block.ordered) return;

    /*
     * ⚠️ One key belongs to exactly ONE ordered list inside one `##` section,
     * and anything ambiguous emits nothing.
     *
     * The key is numbered across the SECTION («1-ج · 2-ب · 3-ب · 4-أ») and the
     * list is indexed per BLOCK, so `position + 1` is only the key's numbering
     * while the section holds a single list. `parseMarkdown` ends a list at the
     * first line that does not match `ORDERED_ITEM` — a blank line between two
     * groups of questions, or one question wrapped onto a second line, splits
     * one authored list into two `list` blocks while the rendered page looks
     * exactly the same. The second block then starts counting at 1 again and
     * publishes its questions carrying the FIRST block's answers.
     *
     * Hence two guards, the same rule from both sides. A forward break alone
     * does not fix it: the first list would go silent and the second would
     * still be wrong.
     */
    for (let back = index - 1; back >= 0; back -= 1) {
      const previous = blocks[back];
      if (!previous || previous.kind === 'heading') break;
      // A continuation list: its numbering no longer starts at 1, so nothing
      // here can be matched against the section's key.
      if (previous.kind === 'list' && previous.ordered) return;
    }

    let key: Map<number, number> | null = null;
    for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
      const next = blocks[cursor];
      if (!next || next.kind === 'heading') break;
      // A key sitting behind another question list is not this list's key.
      if (next.kind === 'list' && next.ordered) break;
      if (next.kind !== 'paragraph') continue;
      const [head, ...rest] = next.text;
      if (head?.kind === 'strong' && head.value.includes(ANSWER_KEY_LABEL)) {
        key = parseAnswerKey(flatten(rest));
        break;
      }
    }
    if (!key || key.size === 0) return;

    block.items.forEach((item, position) => {
      const text = flatten(item);
      // `split` on a marker regex yields [stem, letter, option, letter, …].
      const parts = text.split(OPTION_MARKER);
      const stem = (parts[0] ?? '').trim();
      const options: string[] = [];
      for (let part = 2; part < parts.length; part += 2) {
        const option = (parts[part] ?? '').trim();
        if (option.length > 0) options.push(option);
      }
      if (stem.length === 0 || options.length < 2) return;

      const answerIndex = key.get(position + 1);
      if (answerIndex === undefined) return;
      const answer = options[answerIndex];
      // The key named a letter this question does not offer — a typo in the
      // article. Dropping the question is right; publishing option «(د)» as the
      // answer to a three-option question is not.
      if (answer === undefined) return;

      questions.push({ question: stem, options, answerIndex, answer });
    });
  });

  return questions.length >= MIN_QUESTIONS ? questions : [];
}
