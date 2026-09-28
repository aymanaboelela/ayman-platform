import type { VideoTrim } from '@ayman/contracts/video';

/**
 * «قص الفيديو» on the student's side — the player plays the ORIGINAL file and
 * these decide what of it the student sees. Pure, so the arithmetic is tested
 * without a video element.
 */

/** The part of the file that plays: `[start, end]` on the original timeline. */
export function trimWindow(trim: VideoTrim | null | undefined, duration: number): { start: number; end: number } {
  const start = trim?.start ?? 0;
  const end = trim?.end ?? duration;
  return { start, end: Math.max(start, end) };
}

/** A position inside a cut jumps to the cut's end; anything else stays put. */
export function skipCuts(t: number, trim: VideoTrim | null | undefined): number {
  for (const cut of trim?.cuts ?? []) {
    if (t >= cut.from && t < cut.to) return cut.to;
  }
  return t;
}

/** Seconds actually watched to reach `t` — what the clock under the bar says. */
export function watchedAt(t: number, trim: VideoTrim | null | undefined): number {
  const start = trim?.start ?? 0;
  let removed = 0;
  for (const cut of trim?.cuts ?? []) {
    if (t >= cut.to) removed += cut.to - cut.from;
    else if (t > cut.from) removed += t - cut.from;
  }
  return Math.max(0, t - start - removed);
}
