/**
 * The arithmetic of a self-test, kept out of the component so it is tested
 * without a DOM.
 */

export type PracticeBand = 'excellent' | 'great' | 'good' | 'review';

/** Same cut-offs a teacher would say out loud: 90 / 75 / 60. */
export function practiceBand(score: number, total: number): PracticeBand {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.9) return 'excellent';
  if (ratio >= 0.75) return 'great';
  if (ratio >= 0.6) return 'good';
  return 'review';
}

export function percent(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

/**
 * A fresh order of `0..n-1`. Options are shuffled on every attempt so a retake
 * measures the lesson, not the memory of «كانت التالتة». Never during render:
 * the runner calls this from the click that starts an attempt, so the server
 * HTML and the first client render agree.
 */
export function shuffledOrder(n: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

// ── the best score, on this device only ──────────────────────────────────

/**
 * ⚠️ localStorage, never an account: the page has no session by design, and
 * nothing here is a record anyone else reads. Every access is wrapped — a
 * private window, blocked storage or a full quota must leave the quiz working
 * and only lose the «أعلى نتيجة» line.
 */
const KEY = 'practice:v1:';

/**
 * The storage id of one set. The Arabic track keeps the shape it shipped with
 * (`2-2-1`), so a score a student already has survives the Languages track
 * arriving; Languages gets its own (`2-languages-2-1`).
 */
export function bestKey(year: number, track: string, code: string): string {
  return track === 'languages' ? `${year}-languages-${code}` : `${year}-${code}`;
}

/** Same-tab writes do not fire `storage`, so the store announces its own. */
const listeners = new Set<() => void>();

export function subscribeBest(listener: () => void): () => void {
  listeners.add(listener);
  globalThis.addEventListener?.('storage', listener);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener?.('storage', listener);
  };
}

export interface PracticeBest {
  score: number;
  total: number;
}

/** The stored string as-is — a stable snapshot for `useSyncExternalStore`. */
export function readBestRaw(id: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`${KEY}${id}`) ?? null;
  } catch {
    return null;
  }
}

export function parseBest(raw: string | null): PracticeBest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PracticeBest>;
    return typeof parsed.score === 'number' && typeof parsed.total === 'number' && parsed.total > 0
      ? { score: parsed.score, total: parsed.total }
      : null;
  } catch {
    return null;
  }
}

export function readBest(id: string): PracticeBest | null {
  return parseBest(readBestRaw(id));
}

/** Stores `result` if it beats what is there; returns whether it did. */
export function recordBest(id: string, result: PracticeBest): boolean {
  const previous = readBest(id);
  const better = !previous || percent(result.score, result.total) > percent(previous.score, previous.total);
  if (!better) return false;
  try {
    globalThis.localStorage?.setItem(`${KEY}${id}`, JSON.stringify(result));
  } catch {
    return false;
  }
  for (const listener of listeners) listener();
  return true;
}
