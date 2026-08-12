// Self-referencing package subpaths, NOT relative imports — see the identical
// comment in `./question.ts` for why (hazard H3). This module is consumed at
// runtime by `apps/api`'s `QuestionBankService.bulkImport`, so every one of
// its own imports must resolve under Node's ESM loader, not just under
// vitest/Turbopack's bundler resolution.
import { copy } from "@ayman/contracts/copy";
import { formatCopy } from "@ayman/contracts/format";
import {
  QuestionInputSchema,
  type QuestionInput,
} from "@ayman/contracts/quiz/question";

export interface ImportError {
  /** 1-based, so it matches what the instructor sees in the preview. */
  blockIndex: number;
  /** 1-based line number WITHIN the block. */
  line: number;
  message: string;
}

export interface ImportResult {
  questions: QuestionInput[];
  errors: ImportError[];
}

/** A. / a) / أ. / ب) — Latin and Arabic ordinal letters, dot or paren. */
const OPTION_LINE = /^\s*([A-Ja-jأبجدهوزحط])\s*[).．.]\s*(.+?)\s*$/;
const ANSWER_LINE =
  /^\s*(?:ANSWER|Answer|answer|الإجابة|الاجابة)\s*[:：]\s*(.+?)\s*$/;
const TYPE_LINE = /^\s*(?:TYPE|النوع)\s*[:：]\s*(\w+)\s*$/i;
const PATTERN_LINE = /^\s*=\s*(.+?)\s*$/;

/** Latin A–J then the Arabic abjad order أ ب ج د هـ و ز ح ط. */
const LETTER_ORDER = "ABCDEFGHIJ";
const ARABIC_LETTER_ORDER = ["أ", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط"];

function letterToIndex(letter: string): number {
  const latin = LETTER_ORDER.indexOf(letter.toUpperCase());
  if (latin >= 0) return latin;
  return ARABIC_LETTER_ORDER.indexOf(letter);
}

const TRUE_WORDS = new Set(["صح", "صحيح", "true", "TRUE", "True"]);
const FALSE_WORDS = new Set(["خطأ", "غلط", "false", "FALSE", "False"]);

function toParagraphs(lines: readonly string[]): string {
  // The importer emits paragraph markup only. The API sanitizes it again on
  // write, so a paste containing markup cannot smuggle anything through.
  return lines
    .map(
      (line) =>
        `<p>${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`,
    )
    .join("");
}

/**
 * A deliberately small Aiken superset:
 *   - blocks separated by blank lines
 *   - stem lines until the first option/pattern/answer line
 *   - `A. text` options, Latin or Arabic letters
 *   - `ANSWER: B` or `الإجابة: ب`, comma-separated for multi-choice
 *   - `TYPE: short` + `= pattern` lines, or `TYPE: essay`
 *
 * Anything richer (GIFT, Moodle XML, QTI) is an importer we can add later
 * against the same `QuestionInput` output. The parser's contract is that every
 * question it returns already satisfies `QuestionInputSchema`.
 */
export function parseQuestionBlocks(
  text: string,
  categoryId: string,
): ImportResult {
  const blocks = text
    .replaceAll("\r\n", "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.split("\n").filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0);

  const questions: QuestionInput[] = [];
  const errors: ImportError[] = [];

  if (blocks.length === 0) {
    return {
      questions,
      errors: [
        { blockIndex: 1, line: 1, message: copy.quizErrors.importNoQuestions },
      ],
    };
  }

  blocks.forEach((lines, index) => {
    const blockIndex = index + 1;
    const stem: string[] = [];
    const options: { letter: string; body: string }[] = [];
    const patterns: string[] = [];
    let answerLetters: string[] = [];
    let declaredType: string | null = null;
    let sawAnswerLine = false;

    for (const line of lines) {
      const typeMatch = TYPE_LINE.exec(line);
      if (typeMatch) {
        declaredType = typeMatch[1]!.toLowerCase();
        continue;
      }
      const answerMatch = ANSWER_LINE.exec(line);
      if (answerMatch) {
        sawAnswerLine = true;
        answerLetters = answerMatch[1]!
          .split(/[,،و]/)
          .map((part) => part.trim())
          .filter(Boolean);
        continue;
      }
      const patternMatch = PATTERN_LINE.exec(line);
      if (patternMatch) {
        patterns.push(patternMatch[1]!);
        continue;
      }
      const optionMatch = OPTION_LINE.exec(line);
      if (optionMatch && (options.length > 0 || stem.length > 0)) {
        options.push({ letter: optionMatch[1]!, body: optionMatch[2]! });
        continue;
      }
      stem.push(line.trim());
    }

    if (stem.length === 0) {
      errors.push({
        blockIndex,
        line: 1,
        message: copy.quizErrors.stemRequired,
      });
      return;
    }

    const base = {
      categoryId,
      stemHtml: toParagraphs(stem),
      defaultMark: 1,
      settings: { shuffleOptions: true, caseSensitive: false },
    };

    let candidate: unknown;

    if (
      declaredType === "essay" ||
      (declaredType === null &&
        options.length === 0 &&
        patterns.length === 0 &&
        !sawAnswerLine)
    ) {
      candidate = {
        ...base,
        type: "essay",
        options: [],
        settings: { ...base.settings },
      };
    } else if (declaredType === "short" || patterns.length > 0) {
      if (patterns.length === 0) {
        errors.push({
          blockIndex,
          line: 1,
          message: copy.quizErrors.patternRequired,
        });
        return;
      }
      candidate = {
        ...base,
        type: "short_answer",
        // Every listed pattern is full credit; partial-credit patterns are an
        // editor-only feature, not something anyone hand-writes in a paste.
        options: patterns.map((pattern) => ({
          answerPattern: pattern,
          fraction: 1,
        })),
      };
    } else {
      if (options.length === 0) {
        errors.push({
          blockIndex,
          line: 1,
          message: formatCopy(copy.quizErrors.importNoOptions, {
            n: blockIndex,
          }),
        });
        return;
      }
      if (!sawAnswerLine) {
        errors.push({
          blockIndex,
          line: 1,
          message: formatCopy(copy.quizErrors.importNoAnswerLine, {
            n: blockIndex,
          }),
        });
        return;
      }

      const correctIndexes: number[] = [];
      for (const letter of answerLetters) {
        const position = letterToIndex(letter);
        if (position < 0 || position >= options.length) {
          errors.push({
            blockIndex,
            line: 1,
            message: formatCopy(copy.quizErrors.importUnknownLetter, {
              n: blockIndex,
              letter,
            }),
          });
          return;
        }
        correctIndexes.push(position);
      }

      const bodies = options.map((option) => option.body.trim());
      const isTrueFalse =
        options.length === 2 &&
        bodies.some((body) => TRUE_WORDS.has(body)) &&
        bodies.some((body) => FALSE_WORDS.has(body));

      const share = 1 / correctIndexes.length;
      candidate = {
        ...base,
        type: isTrueFalse
          ? "true_false"
          : correctIndexes.length > 1
            ? "mcq_multi"
            : "mcq_single",
        options: options.map((option, position) => ({
          bodyHtml: toParagraphs([option.body]),
          fraction: correctIndexes.includes(position)
            ? correctIndexes.length > 1
              ? share
              : 1
            : 0,
        })),
      };
    }

    // The parser never emits anything the shared schema would reject — the
    // preview an instructor sees is exactly what the API will accept.
    const parsed = QuestionInputSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        blockIndex,
        line: 1,
        message:
          parsed.error.issues[0]?.message ?? copy.quizErrors.importUnknownType,
      });
      return;
    }
    questions.push(parsed.data);
  });

  return { questions, errors };
}
