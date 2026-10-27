import { cairoParts, fromCairoWall } from '@ayman/contracts/marketing/pacing';
import { shortStudentName } from '@ayman/contracts/social/names';
import type { SocialFacts, SocialPerson, SocialPostKind } from '@ayman/contracts/social/posts';

/**
 * The pure half of the scan: what counts as one event, how it is keyed, and
 * what its post says. `SocialSourcesService` only reads rows and hands them
 * here, so every rule below is pinned by `social-sources.spec.ts` without a
 * database.
 */

/** One post the scan would like to exist. `sourceKey` is the whole dedupe. */
export interface Candidate {
  sourceKey: string;
  kind: SocialPostKind;
  facts: SocialFacts;
  /** Path on the platform, without the origin — the service adds `APP_URL`. */
  path: string;
}

/**
 * The candidates worth inserting: each key once, and none already in the
 * table. Order is kept, so the newest event of a scan is drafted first.
 *
 * The UNIQUE index is what actually guarantees one row per event — two scans
 * racing would both pass this filter and the second insert would be skipped
 * by the database. This only saves the round trip, and keeps two candidates
 * with one key inside a single scan from reaching `createMany` at all.
 */
export function freshCandidates(candidates: readonly Candidate[], existing: ReadonlySet<string>): Candidate[] {
  const seen = new Set(existing);
  const out: Candidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.sourceKey)) continue;
    seen.add(candidate.sourceKey);
    out.push(candidate);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The Cairo week an instant falls in, starting SATURDAY — the Egyptian school
 * week, and the order the calendar draws its columns in.
 */
export function cairoWeekStart(at: Date): { key: string; start: Date } {
  const p = cairoParts(at);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.date));
  // getUTCDay: Sunday 0 … Saturday 6. Days since the last Saturday:
  const since = (day.getUTCDay() + 1) % 7;
  day.setUTCDate(day.getUTCDate() - since);
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth() + 1;
  const d = day.getUTCDate();
  return { key: `${y}-${pad(m)}-${pad(d)}`, start: fromCairoWall(y, m, d, 0) };
}

/** The last COMPLETE Cairo week before `now` — a digest only of numbers that will not move. */
export function previousWeek(now: Date): { key: string; start: Date; end: Date } {
  const current = cairoWeekStart(now);
  const previous = cairoWeekStart(new Date(current.start.getTime() - 3 * 86_400_000));
  return { key: previous.key, start: previous.start, end: current.start };
}

export function percentOf(score: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (score / total) * 100)) : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function person(fullName: string, extra: Partial<Omit<SocialPerson, 'name'>> = {}): SocialPerson {
  return {
    name: shortStudentName(fullName) || '—',
    photoKey: extra.photoKey ?? null,
    score: extra.score ?? null,
    total: extra.total ?? null,
    rank: extra.rank ?? null,
  };
}

// ── Exam results ───────────────────────────────────────────────────────────

export interface FinalAttempt {
  userId: string;
  fullName: string;
  score: number;
  total: number;
  passPercent: number;
  submittedAt: Date;
}

/** A results post needs a real cohort behind its average; fewer is an anecdote. */
export const RESULTS_MIN_TAKERS = 10;

/**
 * When a quiz's numbers have settled: its window closed, or the rush is over —
 * nobody has handed in for two days. Before that the average still moves and
 * the top three may not be the top three.
 */
export const RESULTS_QUIET_MS = 48 * 3_600_000;

export function resultsSettled(input: { openUntil: Date | null; lastSubmittedAt: Date; now: Date }): boolean {
  if (input.openUntil && input.openUntil.getTime() <= input.now.getTime()) return true;
  return input.now.getTime() - input.lastSubmittedAt.getTime() >= RESULTS_QUIET_MS;
}

/**
 * Each student's BEST final mark (an improvement sitting replaces a weaker
 * one, as everywhere else on the platform), then the cohort's numbers.
 * `null` below the minimum cohort.
 */
export function resultsFacts(
  quiz: { examTitle: string; courseTitle: string },
  attempts: readonly FinalAttempt[],
): Extract<SocialFacts, { kind: 'results' }> | null {
  const best = new Map<string, FinalAttempt & { percent: number }>();
  for (const attempt of attempts) {
    if (!(attempt.total > 0)) continue;
    const percent = percentOf(attempt.score, attempt.total);
    const current = best.get(attempt.userId);
    if (!current || percent > current.percent || (percent === current.percent && attempt.submittedAt < current.submittedAt)) {
      best.set(attempt.userId, { ...attempt, percent });
    }
  }
  const rows = [...best.values()];
  if (rows.length < RESULTS_MIN_TAKERS) return null;

  const average = rows.reduce((sum, row) => sum + row.percent, 0) / rows.length;
  const passed = rows.filter((row) => row.percent >= row.passPercent).length;
  const fullMarks = rows.filter((row) => row.score >= row.total).length;
  // Highest mark first; on a tie, whoever handed in first — the same rule as
  // the honor board's ranking, and stable between two scans.
  const top = [...rows]
    .sort((a, b) => b.percent - a.percent || a.submittedAt.getTime() - b.submittedAt.getTime())
    .slice(0, 3)
    .map((row) => person(row.fullName, { score: round1(row.score), total: round1(row.total) }));

  return {
    kind: 'results',
    examTitle: quiz.examTitle,
    courseTitle: quiz.courseTitle,
    takers: rows.length,
    averagePercent: round1(average),
    passRate: round1((passed / rows.length) * 100),
    fullMarks,
    top,
  };
}

// ── Honor board ────────────────────────────────────────────────────────────

export interface HonorEntry {
  at: Date;
  fullName: string;
  title: string;
  /** The board photo the instructor set — never the account avatar. */
  photoKey: string | null;
  rank: number | null;
  score: number | null;
  total: number | null;
}

/** A round still being filled in is not posted: the newest name must be this old. */
export const HONOR_SETTLE_MS = 2 * 3_600_000;

/**
 * One post per Cairo day the board was added to — the same grouping the
 * public board draws its rounds by. Places first (a hand-placed rank), then
 * marks, then the order they were added; five names at most, because a
 * square image holds five legible ones.
 */
export function honorRounds(entries: readonly HonorEntry[], now: Date): { day: string; facts: Extract<SocialFacts, { kind: 'honor' }> }[] {
  const byDay = new Map<string, HonorEntry[]>();
  for (const entry of entries) {
    const day = cairoParts(entry.at).day;
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }

  const rounds: { day: string; facts: Extract<SocialFacts, { kind: 'honor' }> }[] = [];
  for (const [day, group] of byDay) {
    const newest = Math.max(...group.map((entry) => entry.at.getTime()));
    if (now.getTime() - newest < HONOR_SETTLE_MS) continue;

    const sorted = [...group].sort((a, b) => {
      const rank = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
      if (rank !== 0) return rank;
      const pa = a.score !== null && a.total ? a.score / a.total : -1;
      const pb = b.score !== null && b.total ? b.score / b.total : -1;
      return pb - pa || a.at.getTime() - b.at.getTime();
    });

    rounds.push({
      day,
      facts: {
        kind: 'honor',
        day,
        title: mostCommon(group.map((entry) => entry.title)),
        people: sorted.slice(0, 5).map((entry) =>
          person(entry.fullName, {
            photoKey: entry.photoKey,
            rank: entry.rank,
            score: entry.score === null ? null : round1(entry.score),
            total: entry.total === null ? null : round1(entry.total),
          }),
        ),
      },
    });
  }
  return rounds.sort((a, b) => b.day.localeCompare(a.day));
}

function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0] ?? '';
  for (const [value, count] of counts) if (count > (counts.get(best) ?? 0)) best = value;
  return best;
}

// ── Certificates ───────────────────────────────────────────────────────────

export interface EarnedCertificate {
  userId: string;
  fullName: string;
  /** The unit (section) title, or the exam title. */
  title: string;
}

/**
 * The week's certificates as one post: a total, the units that earned the
 * most, and up to six names — one per student, however many they earned.
 */
export function certificatesFacts(weekStart: string, earned: readonly EarnedCertificate[]): Extract<SocialFacts, { kind: 'certificates' }> | null {
  if (earned.length === 0) return null;
  const byTitle = new Map<string, number>();
  for (const row of earned) byTitle.set(row.title, (byTitle.get(row.title) ?? 0) + 1);
  const units = [...byTitle]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([title, count]) => ({ title, count }));

  const names: SocialPerson[] = [];
  const seen = new Set<string>();
  for (const row of earned) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    names.push(person(row.fullName));
    if (names.length === 6) break;
  }

  return { kind: 'certificates', weekStart, total: earned.length, units, people: names };
}

/** `/news/<slug>` — Arabic slugs percent-encoded once, the way the site links them. */
export function newsPath(slug: string): string {
  return `/news/${encodeURIComponent(slug)}`;
}

export function coursePath(slug: string): string {
  return `/courses/${encodeURIComponent(slug)}`;
}
