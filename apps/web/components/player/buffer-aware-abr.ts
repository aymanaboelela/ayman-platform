/**
 * How much of the measured line a rung may use, given how much is already
 * buffered ahead of the playhead.
 *
 * #823 set hls.js's factors to a flat 0.7 / 0.5. That cured «بيعلّق»
 * (Cloudflare serves Egypt from Marseille and a line swings 1–9 Mbit/s from
 * one segment to the next), and it cost the picture. 720p needed ~1.7 Mbit/s
 * held and ~2.4 to climb back, so a line that dips now and then spent the
 * lecture on 480p. «الصورة مش حلوة خالص» (2026-11-18).
 *
 * A flat factor protects against a dip just as hard when a minute is
 * buffered as when two seconds are, and only the second case can freeze
 * the picture. With 30 s ahead, a 720p segment that takes twice real time
 * costs six seconds of buffer. Nothing visible happens, and the next
 * segments refill it. So:
 *
 *   · buffer shallow (< 15 s): 0.7 / 0.5 as #823. Nothing in hand to absorb
 *     a slow segment, so leave the line headroom.
 *   · buffer deep (≥ 30 s): 0.9 / 0.75. 720p (AVERAGE-BANDWIDTH 1.19 Mbit/s
 *     on the reference lecture) holds at ~1.3 and climbs back at ~1.6.
 *   · in between: a straight line, so a draining buffer walks the player
 *     down gradually instead of flipping it at one threshold.
 *
 * hls.js reads `config.abrBandWidthFactor` on every level decision, so
 * writing it on the live instance takes effect from the next segment. Its
 * own emergency switch (abandon a segment that won't land before the buffer
 * runs dry) is untouched and still has the last word.
 */
export const SHALLOW_BUFFER_S = 15;
export const DEEP_BUFFER_S = 30;

const SHALLOW = { down: 0.7, up: 0.5 } as const;
const DEEP = { down: 0.9, up: 0.75 } as const;

export interface AbrFactors {
  /** `abrBandWidthFactor`: share of the line a rung may use to stay. */
  down: number;
  /** `abrBandWidthUpFactor`: share of the line a rung may use to climb. */
  up: number;
}

export function abrFactorsFor(bufferAheadSeconds: number): AbrFactors {
  if (!(bufferAheadSeconds > SHALLOW_BUFFER_S)) return { ...SHALLOW };
  if (bufferAheadSeconds >= DEEP_BUFFER_S) return { ...DEEP };
  const t = (bufferAheadSeconds - SHALLOW_BUFFER_S) / (DEEP_BUFFER_S - SHALLOW_BUFFER_S);
  const at = (a: number, b: number) => Math.round((a + (b - a) * t) * 100) / 100;
  return { down: at(SHALLOW.down, DEEP.down), up: at(SHALLOW.up, DEEP.up) };
}

/** Seconds buffered ahead of the playhead, counting only the range it sits in. */
export function bufferAhead(element: Pick<HTMLMediaElement, 'buffered' | 'currentTime'>): number {
  const { buffered, currentTime } = element;
  for (let i = 0; i < buffered.length; i += 1) {
    // A small tolerance: right after a seek the playhead can sit a hair
    // before the range hls.js just appended.
    if (buffered.start(i) <= currentTime + 0.5 && currentTime < buffered.end(i)) {
      return buffered.end(i) - currentTime;
    }
  }
  return 0;
}
