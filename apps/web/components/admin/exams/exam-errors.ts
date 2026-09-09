import { copy } from '@ayman/contracts/copy/admin';

/**
 * The API's refusals, as something a control can render.
 *
 * ## The five the exam screens can actually hit
 *
 * `ScheduledExamsService` and `QuizBuilderService` throw
 * `BadRequestException({ code })` with a machine-readable slug on every
 * refusal that is a DECISION rather than a fault:
 *
 *   quiz_has_no_slots               publish, paper is empty
 *   sum_marks_must_be_positive      publish, every question is worth zero
 *   exam_has_attempts               delete, somebody has already sat it
 *   exam_window_inverted            create/patch, «يقفل» is not after «يفتح»
 *   improvement_is_course_exam_only only a course's final exam may offer one
 *
 * Each names a different field on a different screen, so a single «مقدرناش
 * نحفظ» over all five is the difference between a fixable mistake and a
 * mysterious one at 19:45.
 *
 * ## ⚠️ THE CODE DOES NOT SURVIVE THE WIRE
 *
 * `AllExceptionsFilter` (apps/api/src/common/filters/all-exceptions.filter.ts)
 * serialises exactly four fields — `statusCode`, `message`, `requestId`,
 * `timestamp` — and `message` is taken from the exception's own `message`
 * string. A Nest exception constructed from an OBJECT with no `message` key
 * has `"Bad Request Exception"` as its message, so `{ code: 'exam_has_attempts',
 * attempts: 12 }` reaches this app as:
 *
 *     { statusCode: 400, message: "Bad Request Exception", requestId, timestamp }
 *
 * The code is gone. (So is `blockers` on the student-delete conflict, which
 * `students/actions.ts` still reads — same cause.) Fixing that is an API
 * change and this pass does not own `apps/api/**`.
 *
 * So this module reads the code WHEN IT IS THERE — the parse below is the whole
 * fix on the day the filter starts passing it through — and every caller also
 * supplies a `fallback` it can justify from data it already holds:
 *
 *   · publish  → the row knows `questionCount`. Zero means the paper is empty
 *                (`quiz_has_no_slots`); non-zero means the marks are
 *                (`sum_marks_must_be_positive`). Those are the only two things
 *                `setPublished`'s preflight rejects.
 *   · delete   → the row knows `attemptCount`, and it is the ONLY reason delete
 *                is refused. The button is not even offered when it is non-zero.
 *   · save     → the form checks the window itself before it submits, so a 400
 *                on a window that looked valid here is still the inverted one
 *                (the API re-checks the pair against what is stored).
 *
 * That is guessing, and it is labelled as guessing. It is a better guess than
 * «مقدرناش نحفظ» and it costs nothing when the code arrives properly.
 */
export type ExamFailure =
  | 'no_questions'
  | 'no_marks'
  | 'has_attempts'
  | 'window_inverted'
  | 'improvement_only'
  | 'unknown';

/** The wire slug → our own name. Everything unrecognised stays `null` so the
 *  caller's context-derived fallback wins rather than being overridden by a
 *  wrong guess. */
const BY_CODE: Record<string, ExamFailure> = {
  quiz_has_no_slots: 'no_questions',
  sum_marks_must_be_positive: 'no_marks',
  improvement_sum_marks_must_be_positive: 'no_marks',
  exam_has_attempts: 'has_attempts',
  exam_window_inverted: 'window_inverted',
  improvement_is_course_exam_only: 'improvement_only',
};

/**
 * The `code` off a failed response body, if the API ever sends one.
 *
 * `unknown` in, `ExamFailure | null` out: this is called on `AdminApiError`'s
 * `payload`, which is whatever JSON the API answered with — or `null` when the
 * body was not JSON at all.
 */
export function examFailureFromPayload(payload: unknown): ExamFailure | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const code = (payload as { code?: unknown }).code;
  if (typeof code !== 'string') return null;
  return BY_CODE[code] ?? null;
}

const c = copy.admin.monthlyExams;

/**
 * What to put on the offending control.
 *
 * `improvement_only` borrows `copy.quizAdmin.improvementExamOnly` rather than
 * restating it: it is the same rule, said once, and these screens never set
 * `allowsImprovement` themselves — it can only arrive here via the quiz
 * builder's own settings write.
 */
export function examFailureMessage(failure: ExamFailure): string {
  switch (failure) {
    case 'no_questions':
      return c.publishNeedsQuestions;
    case 'no_marks':
      return c.publishNeedsMarks;
    case 'has_attempts':
      return c.deleteHasAttempts;
    case 'window_inverted':
      return c.windowInverted;
    case 'improvement_only':
      return copy.quizAdmin.improvementExamOnly;
    case 'unknown':
      return c.saveFailed;
  }
}
