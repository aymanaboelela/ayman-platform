'use client';

import { useEffect } from 'react';
import { DWELL_COMPLETE_MS } from '@ayman/contracts';
import type { HeartbeatResponse } from '@ayman/contracts';
import { postDwell } from '@/lib/progress-client';

export interface UseDwellCompleteOptions {
  lessonId: string;
  /** Skipped when the lesson is already finished — no point re-asking. */
  enabled: boolean;
  onResponse: (response: HeartbeatResponse) => void;
}

/**
 * Text and attachment lessons complete after 5000ms on the page.
 *
 * The timer here only decides WHEN to ask. The server measures the real
 * elapsed time from its own `first_opened_at`, so firing this early — or a
 * hundred times — cannot complete a lesson faster than five real seconds.
 * A single extra attempt covers the case where the page mounted slightly
 * before the open request landed.
 */
export function useDwellComplete({ lessonId, enabled, onResponse }: UseDwellCompleteOptions): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let retry: number | undefined;

    const ask = async () => {
      try {
        const response = await postDwell(lessonId);
        if (cancelled) return;
        onResponse(response);
        if (!response.progress.completedAt) {
          // The server said "not yet" — its clock is the one that counts.
          retry = window.setTimeout(() => void ask(), DWELL_COMPLETE_MS);
        }
      } catch {
        // Silent: a failed dwell is not worth interrupting reading for, and
        // the manual button is always available.
      }
    };

    const timer = window.setTimeout(() => void ask(), DWELL_COMPLETE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [enabled, lessonId, onResponse]);
}
