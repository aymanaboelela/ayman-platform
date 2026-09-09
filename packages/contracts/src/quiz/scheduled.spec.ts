import { describe, expect, it } from 'vitest';
import { EXAM_LIVE_COUNTDOWN_SECONDS, EXAM_SHELF_TITLE, examPhase } from './scheduled';

/**
 * `examPhase` is the dashboard's answer to «الامتحان فاتح ولا لأ», and
 * `QuizAccessService.assertCanAttempt` is the server's. If the two ever
 * disagree the student is shown a door the server will not open — a banner
 * saying «ادخل الامتحان» over a 403.
 *
 * So this file does not test `examPhase` against a description of the rule. It
 * tests it against a re-statement of `assertCanAttempt`'s ACTUAL comparisons,
 * copied verbatim from `apps/api/src/modules/quiz/quiz-access.service.ts`:
 *
 *     if (quiz.openFrom && now < quiz.openFrom)   -> quiz_not_open_yet
 *     if (quiz.openUntil && now >= quiz.openUntil) -> quiz_closed
 *
 * If someone changes either comparison there, `assertCanAttemptOracle` below
 * stops matching the service and this suite keeps passing — which is why the
 * oracle is written out in full rather than imported: the point is that a
 * reader diffing the two files can see them side by side. The stronger check
 * lives in the API's own integration spec, which drives the real service.
 */
type Denial = 'quiz_not_open_yet' | 'quiz_closed' | null;

function assertCanAttemptOracle(
  openFrom: Date | null,
  openUntil: Date | null,
  now: Date,
): Denial {
  if (openFrom && now < openFrom) return 'quiz_not_open_yet';
  if (openUntil && now >= openUntil) return 'quiz_closed';
  return null;
}

/** Friday 2026-09-11, 20:00 Cairo. Egypt is UTC+3 until the last Thursday of
 *  October, so that wall clock is 17:00Z — not 18:00Z. */
const FRIDAY_8PM_CAIRO = new Date('2026-09-11T17:00:00.000Z');
/** 24 hours later — «من الساعة ٨ للساعة ٨». */
const SATURDAY_8PM_CAIRO = new Date('2026-09-12T17:00:00.000Z');

describe('examPhase', () => {
  it('agrees with assertCanAttempt at every boundary', () => {
    const instants = [
      new Date(FRIDAY_8PM_CAIRO.getTime() - 86_400_000), // a day early
      new Date(FRIDAY_8PM_CAIRO.getTime() - 1), // one millisecond early
      FRIDAY_8PM_CAIRO, // exactly on open
      new Date(FRIDAY_8PM_CAIRO.getTime() + 1),
      new Date(SATURDAY_8PM_CAIRO.getTime() - 1), // one millisecond before close
      SATURDAY_8PM_CAIRO, // exactly on close
      new Date(SATURDAY_8PM_CAIRO.getTime() + 1),
    ];

    for (const now of instants) {
      const phase = examPhase(FRIDAY_8PM_CAIRO, SATURDAY_8PM_CAIRO, now);
      const denial = assertCanAttemptOracle(FRIDAY_8PM_CAIRO, SATURDAY_8PM_CAIRO, now);

      // The whole contract, in one line: the banner offers entry exactly when
      // the server would allow it.
      expect(phase === 'open').toBe(denial === null);
      if (denial === 'quiz_not_open_yet') expect(phase).toBe('upcoming');
      if (denial === 'quiz_closed') expect(phase).toBe('closed');
    }
  });

  it('opens ON the opening instant, not one millisecond after', () => {
    // `now < openFrom` is strict, so 20:00:00.000 exactly is OPEN. A student
    // refreshing at exactly 8pm must get in, not be told to wait.
    expect(examPhase(FRIDAY_8PM_CAIRO, SATURDAY_8PM_CAIRO, FRIDAY_8PM_CAIRO)).toBe('open');
  });

  it('shuts ON the closing instant, not one millisecond after', () => {
    // `now >= openUntil` is inclusive, so 20:00:00.000 the next day is SHUT.
    expect(examPhase(FRIDAY_8PM_CAIRO, SATURDAY_8PM_CAIRO, SATURDAY_8PM_CAIRO)).toBe('closed');
  });

  it('treats a quiz with no window as open', () => {
    // An ordinary lesson quiz. It is never surfaced by the scheduled-exam
    // reads (they filter on `openFrom IS NOT NULL`), but the predicate must
    // still answer honestly for one.
    expect(examPhase(null, null, FRIDAY_8PM_CAIRO)).toBe('open');
  });

  it('never closes an exam that has no closing date', () => {
    const later = new Date('2027-01-01T00:00:00.000Z');
    expect(examPhase(FRIDAY_8PM_CAIRO, null, later)).toBe('open');
  });

  it('accepts ISO strings as well as Dates', () => {
    // The API hands the browser ISO strings; the service hands it Dates. Both
    // callers use this function, so both shapes must work — and must agree.
    expect(examPhase(FRIDAY_8PM_CAIRO.toISOString(), SATURDAY_8PM_CAIRO.toISOString(), FRIDAY_8PM_CAIRO)).toBe(
      examPhase(FRIDAY_8PM_CAIRO, SATURDAY_8PM_CAIRO, FRIDAY_8PM_CAIRO),
    );
  });
});

describe('Cairo wall clock', () => {
  /**
   * The owner types «الجمعة ٨ مساءً» into a `datetime-local` input. If the
   * instant that reaches the database is an hour out, the exam opens at 19:00
   * or 21:00 — indistinguishable from a broken deploy, and only visible to the
   * cohort sitting there waiting.
   *
   * `analytics-shared.ts` already carries a 30-line header about this class of
   * bug cancelling out on a developer's machine and breaking in CI and
   * production. These two assertions pin both sides of the DST edge.
   */
  const cairoWallClock = (instant: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(instant);

  it('reads 17:00Z as 8pm Cairo in September (UTC+3, DST in force)', () => {
    expect(cairoWallClock(FRIDAY_8PM_CAIRO)).toBe('20:00');
  });

  it('reads 18:00Z as 8pm Cairo in November (UTC+2, DST over)', () => {
    // Egypt leaves DST on the last Thursday of October, so the SAME wall clock
    // is a different instant. A hard-coded +3 offset would be an hour wrong
    // for every exam from November onwards.
    expect(cairoWallClock(new Date('2026-11-13T18:00:00.000Z'))).toBe('20:00');
  });
});

describe('constants', () => {
  it('switches to a live countdown at 48 hours', () => {
    expect(EXAM_LIVE_COUNTDOWN_SECONDS).toBe(48 * 60 * 60);
  });

  it('names the exam shelf exactly as ScheduledExamsService writes it', () => {
    // Four separate reads exclude the shelf by this exact string — the learning
    // path, the public catalogue, the section-rename guard and the coverage
    // picker. A stray space here silently un-hides every exam.
    expect(EXAM_SHELF_TITLE).toBe('امتحانات الشهر');
  });
});
