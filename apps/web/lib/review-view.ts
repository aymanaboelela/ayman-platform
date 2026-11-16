import type { LearningPath, PathNode, QuizHistoryRow } from '@ayman/contracts';
import { optionLetter } from '@/components/quiz/option-letter';

/**
 * Everything «نتيجة الامتحان» (the review page) decides from the payloads it
 * already has, kept out of the components so it is tested without a render.
 * Nothing here fetches, and nothing needs a field the API does not send: the
 * board's «الوقت» tile and its per-topic card are absent from this page
 * because no endpoint carries time taken or a question's topic.
 */

/** The slice of a reviewed question these folds read. */
export interface ReviewedQuestion {
  slotPosition: number;
  type: string;
  stemHtml: string;
  options: ReadonlyArray<{ id: string }>;
  response?: unknown;
  correctness?: 'correct' | 'partial' | 'incorrect' | 'needsGrading' | 'unanswered';
  rightAnswerOptionIds?: string[];
}

/** The same set `ReviewList` filters on, so «غلط ٣» here and «٣ غلط من ٢٠» there agree. */
const WRONG = new Set(['incorrect', 'partial', 'unanswered']);

export interface ReviewTally {
  correct: number;
  wrong: number;
  pending: number;
}

/**
 * The stat tiles. `null` when the review window withholds correctness —
 * counting zero right and zero wrong would be a claim, not a blank.
 */
export function reviewTally(questions: readonly ReviewedQuestion[]): ReviewTally | null {
  const gradeable = questions.filter((question) => question.correctness !== undefined);
  if (gradeable.length === 0) return null;
  return {
    correct: gradeable.filter((question) => question.correctness === 'correct').length,
    wrong: gradeable.filter((question) => WRONG.has(question.correctness!)).length,
    pending: gradeable.filter((question) => question.correctness === 'needsGrading').length,
  };
}

export interface MistakeRow {
  slotPosition: number;
  /** The stem as one plain line — the full rich stem is in the paper below. */
  stem: string;
  /** Letters of what was picked, or `null` when this window does not show the response. */
  picked: string | null;
  /** Letters of the right option(s), or `null` when this window withholds them. */
  right: string | null;
}

/**
 * The rows under «أسئلة محتاجة مراجعة».
 *
 * The answer letters are printed only for choice questions, and only from
 * what the payload carries — `response` and `rightAnswerOptionIds` are each
 * absent when the 4×7 review matrix withholds them for this window, and a row
 * then shows just its stem. Same letters as the paper below (`optionLetter`),
 * so the «ب» on the row is the «ب» on the card it links to.
 */
export function mistakeRows(questions: readonly ReviewedQuestion[]): MistakeRow[] {
  return questions
    .filter((question) => question.correctness !== undefined && WRONG.has(question.correctness))
    .map((question) => {
      const choice = !['ordering', 'short_answer', 'essay'].includes(question.type);
      const letters = (ids: readonly string[]) =>
        question.options
          .map((option, index) => (ids.includes(option.id) ? optionLetter(index, question.stemHtml) : null))
          .filter((letter): letter is string => letter !== null)
          .join('، ');
      const chosen = chosenIds(question.response);
      return {
        slotPosition: question.slotPosition,
        stem: stemPreview(question.stemHtml),
        picked: choice && question.response !== undefined ? letters(chosen) : null,
        right: choice && question.rightAnswerOptionIds?.length ? letters(question.rightAnswerOptionIds) : null,
      };
    });
}

function chosenIds(response: unknown): string[] {
  if (!response || typeof response !== 'object') return [];
  const record = response as Record<string, unknown>;
  return record.kind === 'choice' && Array.isArray(record.optionIds) ? (record.optionIds as string[]) : [];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/**
 * A rich stem as one plain line. The input is already sanitized HTML; this
 * only drops the tags and the half-dozen entities a stem actually carries, so
 * `3 ** 2` reads as itself on the row. React escapes the result when it
 * renders, so nothing here has to be safe HTML — it is text.
 */
export function stemPreview(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/div)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NextStep {
  href: string;
  kind: PathNode['kind'];
  title: string;
}

/**
 * Where «المحاضرة الجاية» goes: the course's own `nextLessonId` from
 * `/api/me/path` — the same pointer «مسارك» and the course page use — so the
 * button can never disagree with them.
 *
 * `null` when there is nothing honest to point at: the quiz is on no course
 * of the path (a monthly exam, an open exam), the course is paused, the
 * course is finished, or the next stop is this very quiz (failed and still
 * gating) — a button back to the page the student is on is not a next step.
 */
export function nextStepAfter(
  path: LearningPath | null,
  lessonId: string,
  courseSlug: string | null,
): NextStep | null {
  if (!path) return null;
  const course =
    path.courses.find((entry) => entry.nodes.some((node) => node.id === lessonId || node.lessonId === lessonId)) ??
    (courseSlug ? path.courses.find((entry) => entry.slug === courseSlug) : undefined);
  if (!course?.published || !course.nextLessonId) return null;
  const next = course.nodes.find((node) => node.id === course.nextLessonId);
  if (!next || next.id === lessonId || next.lessonId === lessonId) return null;
  return {
    href: `/courses/${course.slug}/lessons/${next.lessonId}`,
    kind: next.kind,
    title: next.title,
  };
}

/** The row in `/api/me/quizzes` for this quiz, when there is one. */
export function historyRowFor(rows: readonly QuizHistoryRow[] | null, lessonId: string): QuizHistoryRow | null {
  return rows?.find((row) => row.lessonId === lessonId) ?? null;
}
