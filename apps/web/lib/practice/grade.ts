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
export function readBestRaw(year: number, code: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`${KEY}${year}-${code}`) ?? null;
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

export function readBest(year: number, code: string): PracticeBest | null {
  return parseBest(readBestRaw(year, code));
}

/** Stores `result` if it beats what is there; returns whether it did. */
export function recordBest(year: number, code: string, result: PracticeBest): boolean {
  const previous = readBest(year, code);
  const better = !previous || percent(result.score, result.total) > percent(previous.score, previous.total);
  if (!better) return false;
  try {
    globalThis.localStorage?.setItem(`${KEY}${year}-${code}`, JSON.stringify(result));
  } catch {
    return false;
  }
  for (const listener of listeners) listener();
  return true;
}
