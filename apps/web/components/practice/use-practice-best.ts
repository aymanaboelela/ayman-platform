'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { parseBest, readBestRaw, subscribeBest, type PracticeBest } from '@/lib/practice/grade';

/**
 * This device's best score on one lesson, or `null`.
 *
 * `null` on the server and on the first client render (the server snapshot),
 * then the stored value — so the prerendered HTML and hydration agree, and a
 * finished attempt updates every reader on the page at once.
 */
export function usePracticeBest(year: number, code: string): PracticeBest | null {
  const raw = useSyncExternalStore(
    subscribeBest,
    () => readBestRaw(year, code),
    () => null,
  );
  return useMemo(() => parseBest(raw), [raw]);
}
