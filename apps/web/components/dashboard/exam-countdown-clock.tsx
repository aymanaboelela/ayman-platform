'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { useServerCountdown } from '@/components/quiz/quiz-timer';

const c = copy.dashboard.exams;

/**
 * The ticking half of `<ExamCountdownBand>` — and the ONLY part of it that
 * runs in the browser.
 *
 * ## Why this is a second file rather than a `'use client'` on the band
 *
 * The band decides which of three faces to show, and to do that it reads
 * `EXAM_LIVE_COUNTDOWN_SECONDS` from `@ayman/contracts/quiz/scheduled`. That
 * module builds Zod schemas at module scope, and `@ayman/contracts` lists
 * `./src/zod.ts` in its own `sideEffects`, so importing ANY value from it pulls
 * the whole of Zod in — 62 KB gzip — onto the busiest authenticated route in
 * the product. `client-barrel.test.ts` documents that measurement and the
 * dashboard is currently clean of it: the only two client components on the
 * page reach copy and nothing else.
 *
 * So the band stays a Server Component that pays for the schemas for free, and
 * the four lines that genuinely need a browser live down here, importing only
 * the copy table and the countdown hook. This file names no schema.
 *
 * ## Why the clock is anchored on the server's time
 *
 * `useServerCountdown` is the quiz runner's own hook, re-used verbatim: it
 * takes the offset ONCE against `performance.now()` and never reads the device
 * clock again, so a phone an hour fast cannot make the band say an exam is open
 * while `assertCanAttempt` still answers `quiz_not_open_yet`.
 * `StudentExams.serverTime` rides on the payload for exactly this.
 *
 * ## Why there is a fallback at all
 *
 * The hook returns `null` until its first effect runs — i.e. during SSR and on
 * the very first client render. Rendering nothing for that beat would leave a
 * hole in the band that fills in after hydration, so the figure is computed
 * from the two props instead, which are the same two strings on both sides and
 * therefore cannot mismatch. No `Date.now()` is read anywhere in this file.
 */
export function ExamCountdownClock({ opensAt, serverTime }: { opensAt: string; serverTime: string }) {
  const router = useRouter();
  const remainingMs = useServerCountdown(opensAt, serverTime);
  const refreshedRef = useRef(false);

  /*
   * The moment the window opens, ask the server for the page again.
   *
   * Without this, a student sitting on the dashboard at 19:59 waiting for a
   * 20:00 exam watches the clock reach «فاضل 00:00:00» and stop, with no door
   * — the band's `open` face, the «ادخل الامتحان» button and `<NextUpBlock>`
   * standing down are all decisions the SERVER made when the page rendered.
   * `router.refresh()` re-runs those Server Components against a fresh
   * `/api/me/exams`, so the band flips to `open` on its own and the page's
   * "exactly one accent action" arithmetic still adds up.
   *
   * Once, guarded by a ref: `remainingMs` sits at 0 for every subsequent tick
   * until the refresh lands, and a refresh per 250ms tick would be a self-
   * inflicted rate-limit incident on a page that already makes seven requests.
   *
   * It cannot fire on a stale payload either — an exam whose `openFrom` has
   * already passed comes back from the API as `phase: 'open'`, and the band
   * never mounts this component in that phase.
   */
  useEffect(() => {
    if (remainingMs === null || remainingMs > 0 || refreshedRef.current) return;
    refreshedRef.current = true;
    router.refresh();
  }, [remainingMs, router]);

  const fallbackMs = new Date(opensAt).getTime() - new Date(serverTime).getTime();
  const totalSeconds = Math.max(0, Math.ceil((remainingMs ?? fallbackMs) / 1000));

  return (
    /*
     * `role="timer"` carries an implicit `aria-live="off"`, which is what is
     * wanted: `quiz-timer.tsx` documents at length what a per-second live
     * region does to a screen reader, and a countdown that interrupts the
     * whole dashboard once a second for two days is the worse version of that
     * bug. There is no threshold announcer here either — nothing about this
     * clock is an emergency; the exam is a press away once it opens.
     */
    <p className="exam-band__clock" role="timer">
      {countdownLabel(totalSeconds)}
    </p>
  );
}

/** Two digits, always. Contains no words, so it is not a copy-table violation —
 *  the same licence `lib/format.ts` states in its own header. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The two forms the copy table offers, and the boundary between them.
 *
 * Above a day it is «فاضل ٢ يوم و ٥ ساعة» — minutes and seconds are noise on a
 * wait measured in nights. Under one it is the clock, «فاضل 05:14:09», where the
 * seconds are the point. Days are DROPPED rather than printed as a zero, which
 * is what `countdownDays` and `countdownHours` being two separate strings is
 * for: «فاضل ٠ يوم و ٥ ساعة» is a sentence no one writes.
 *
 * All three fields are padded in the hours form so the string keeps one width
 * as it counts down past each boundary — `tabular-nums` on `.exam-band__clock`
 * does the rest.
 */
function countdownLabel(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);

  if (days > 0) return formatCopy(c.countdownDays, { d: days, h: hours });

  return formatCopy(c.countdownHours, {
    h: pad(hours),
    m: pad(Math.floor((totalSeconds % 3_600) / 60)),
    s: pad(totalSeconds % 60),
  });
}
