import type {
  QuizHistoryPoint,
  QuizHistoryRow,
  StudentQuizHistory,
} from '@ayman/contracts';
import { DISTINCTION_PERCENT } from '@/lib/achievements';

/**
 * Everything `/results` decides from the numbers, kept out of the components
 * so it is tested without a render. Pure folds over the one payload
 * `GET /api/me/quizzes` already returns — nothing here fetches, and nothing
 * here needs a field the API does not send.
 */

/**
 * The line the chart draws and the gauge ticks. Each quiz carries its own
 * `passPercent` — the foundation exam's is 70 — but the average and the chart
 * span every quiz at once, so they show the platform default rather than
 * pretending one threshold applies to all of them. The per-exam cards state
 * each quiz's REAL verdict, from `passed`.
 */
export const PASS_LINE_PERCENT = 50;

/** «امتياز» — the same 90 the dashboard's achievement and mastery card use. */
export const EXCELLENT_PERCENT = DISTINCTION_PERCENT;

/**
 * Where an AVERAGE sits. Deliberately not called a verdict: `low` is not
 * "failed", it is below the default line, and the hero words it as a place on
 * a road («لسه في الطريق»). Only `QuizHistoryRow.passed` is a verdict.
 */
export type ScoreBand = 'high' | 'pass' | 'low';

export function scoreBand(percent: number): ScoreBand {
  if (percent >= EXCELLENT_PERCENT) return 'high';
  if (percent >= PASS_LINE_PERCENT) return 'pass';
  return 'low';
}

export type MoodKey =
  | 'moodFirst'
  | 'moodRising'
  | 'moodHigh'
  | 'moodAllPassed'
  | 'moodPass'
  | 'moodLow';

/**
 * A climb worth naming. Ten points, not "any rise": 27% → 29% is noise on a
 * page about exam results, and calling it progress teaches a student to
 * discount the sentence the next time it is true.
 */
const RISING_BY = 10;

/**
 * The hero's one sentence, in order of what is most worth saying.
 *
 * 1. A single sitting is a start, whatever it scored — «أول درجة اتسجّلت».
 * 2. A real climb is named with its numbers, even when the average is still
 *    low: it is the most encouraging TRUE thing on the page, and it is the
 *    one a low average hides.
 * 3. Then the band — with «كل الامتحانات اتعدّت» taking precedence over the
 *    plain pass line, because it is the more specific good news.
 *
 * There is no sentence for a DECLINE. The per-exam cards show every delta
 * honestly; the headline's job is the way forward, and a student whose last
 * score fell already knows.
 */
export function resultsMood(
  summary: StudentQuizHistory['summary'],
  series: readonly QuizHistoryPoint[],
): { key: MoodKey; vars: Record<string, number> } {
  if (summary.attemptsTotal <= 1) return { key: 'moodFirst', vars: {} };

  const first = series[0];
  const last = series.at(-1);
  if (first && last && last.scorePercent - first.scorePercent >= RISING_BY) {
    return { key: 'moodRising', vars: { first: first.scorePercent, last: last.scorePercent } };
  }

  const band = summary.averagePercent === null ? 'low' : scoreBand(summary.averagePercent);
  if (band === 'high') return { key: 'moodHigh', vars: {} };
  if (summary.quizzesTaken > 0 && summary.passedCount === summary.quizzesTaken) {
    return { key: 'moodAllPassed', vars: { passed: summary.passedCount, total: summary.quizzesTaken } };
  }
  return { key: band === 'pass' ? 'moodPass' : 'moodLow', vars: {} };
}

/** Whether any exam is still waiting on a human to mark its essay. */
export function hasPendingMarks(rows: readonly QuizHistoryRow[]): boolean {
  return rows.some((row) => row.passed === null);
}

/**
 * The latest sitting against the one before it, per quiz.
 *
 * The row carries `best` and `latest` but not the sitting BEFORE the latest,
 * and "did the second try go better" is the one question a two-sitting exam
 * raises. The series has every attempt, oldest first, keyed by lesson — so the
 * answer is already on the page and needs no new field from the API.
 *
 * `null` when a quiz has only one sitting: there is nothing to compare, and a
 * «+0» would claim a comparison that never happened.
 */
export function latestDeltas(series: readonly QuizHistoryPoint[]): Map<string, number> {
  const byLesson = new Map<string, QuizHistoryPoint[]>();
  for (const point of series) {
    const list = byLesson.get(point.lessonId);
    if (list) list.push(point);
    else byLesson.set(point.lessonId, [point]);
  }

  const deltas = new Map<string, number>();
  for (const [lessonId, points] of byLesson) {
    if (points.length < 2) continue;
    deltas.set(lessonId, points.at(-1)!.scorePercent - points.at(-2)!.scorePercent);
  }
  return deltas;
}

export interface CourseGroup {
  courseSlug: string;
  courseTitle: string;
  rows: QuizHistoryRow[];
  passed: number;
}

/**
 * The per-exam list, one group per course.
 *
 * Order is the API's — most recently sat first — at BOTH levels: a course
 * group sits where its most recent exam would have, and its rows keep their
 * order inside it. So grouping re-arranges nothing a student with one course
 * sees, and a student with three sees the course they are working on now at
 * the top rather than in alphabetical order.
 *
 * Keyed on `courseSlug`, not the title: two courses can share a display name
 * across years («الكورس التأسيسي»), and they are different courses.
 */
export function groupByCourse(rows: readonly QuizHistoryRow[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const row of rows) {
    let group = groups.get(row.courseSlug);
    if (!group) {
      group = { courseSlug: row.courseSlug, courseTitle: row.courseTitle, rows: [], passed: 0 };
      groups.set(row.courseSlug, group);
    }
    group.rows.push(row);
    if (row.passed === true) group.passed += 1;
  }
  return [...groups.values()];
}

/**
 * «24 سبتمبر». Arabic month, LATIN digits — the locale every formatter here
 * uses (`lib/format.ts`) — and pinned to Cairo: this renders on a server whose
 * zone is UTC, and an exam submitted at 1am Cairo time would otherwise print
 * as the day before.
 */
const DAY = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Cairo',
});

/** Empty for an unparseable timestamp — a card must not go down over a date. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DAY.format(date);
}

/** The card's verdict, as one of four looks. `null` is "not marked yet", never a fail. */
export type Verdict = 'excellent' | 'passed' | 'failed' | 'pending';

export function verdictOf(row: Pick<QuizHistoryRow, 'passed' | 'bestPercent'>): Verdict {
  if (row.passed === null) return 'pending';
  if (!row.passed) return 'failed';
  return row.bestPercent !== null && row.bestPercent >= EXCELLENT_PERCENT ? 'excellent' : 'passed';
}

/* ── the gauge ──────────────────────────────────────────────────────────── */

/** How much of the circle the gauge draws. The gap is at the bottom, for the label. */
export const GAUGE_SWEEP_DEGREES = 270;

/**
 * A point on the gauge's arc, `t` of the way along it (0..1), in a
 * `size`×`size` box.
 *
 * ## Direction
 *
 * The arc STARTS at the bottom-RIGHT and sweeps counter-clockwise over the
 * top to the bottom-left. In an LTR speedometer the needle rises from the
 * left; this page is RTL, so the reading — and the filling — starts at the
 * right, the same way the chart's time axis and `ProgressRing` run.
 *
 * Angles are measured clockwise from twelve o'clock: t=0 is 135° (bottom
 * right), t=0.5 is 0° (top), t=1 is −135° (bottom left).
 */
export function gaugePoint(t: number, size: number, radius: number): { x: number; y: number } {
  const clamped = Math.min(Math.max(t, 0), 1);
  const degrees = GAUGE_SWEEP_DEGREES / 2 - GAUGE_SWEEP_DEGREES * clamped;
  const radians = (degrees * Math.PI) / 180;
  const centre = size / 2;
  return {
    x: round(centre + radius * Math.sin(radians)),
    y: round(centre - radius * Math.cos(radians)),
  };
}

/**
 * The whole arc as one path, start to end. The VALUE is drawn over the same
 * path with `pathLength="100"` and a dash of `percent` — so the track and the
 * fill can never disagree about where the arc is, and there is no second
 * large-arc flag to get wrong at exactly 180°.
 *
 * `sweep-flag` 0 is counter-clockwise on screen, which is the direction
 * `gaugePoint` walks.
 */
export function gaugeArcPath(size: number, radius: number): string {
  const start = gaugePoint(0, size, radius);
  const end = gaugePoint(1, size, radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 0 ${end.x} ${end.y}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
