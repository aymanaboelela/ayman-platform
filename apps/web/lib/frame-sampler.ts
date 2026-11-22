import { framesSayTooSlow } from '@/lib/weak-device';

/**
 * One measuring window over real frame intervals: skip a short warm-up, keep
 * the next `sample` gaps, then give a verdict through `framesSayTooSlow` (the
 * median, so a GC pause or a chunk load cannot condemn a fast machine).
 *
 * Pure — fed timestamps, not wired to `requestAnimationFrame` — so the edge
 * cases are unit-tested instead of trusted:
 *
 * - A gap over 250 ms is a backgrounded tab, a throttled occluded window or a
 *   debugger pause, not a slow GPU. It is dropped, not counted.
 * - A frame seen while the page is hidden is dropped too: Chrome throttles
 *   `requestAnimationFrame` to ~1 Hz in an occluded tab, which would make
 *   every machine look broken.
 */
export const SAMPLER_WARMUP_FRAMES = 20;
export const SAMPLER_SAMPLE_FRAMES = 90;
const MAX_GAP_MS = 250;

export type SamplerVerdict = 'pending' | 'ok' | 'slow';

export function createFrameSampler(
  warmup = SAMPLER_WARMUP_FRAMES,
  sample = SAMPLER_SAMPLE_FRAMES,
): (now: number, visible: boolean) => SamplerVerdict {
  let last = 0;
  let seen = 0;
  let verdict: SamplerVerdict = 'pending';
  const gaps: number[] = [];

  return (now, visible) => {
    if (verdict !== 'pending') return verdict;
    const gap = now - last;
    last = now;
    if (!visible || gap <= 0 || gap > MAX_GAP_MS) return 'pending';
    seen += 1;
    if (seen <= warmup) return 'pending';
    gaps.push(gap);
    if (gaps.length < sample) return 'pending';
    verdict = framesSayTooSlow(gaps) ? 'slow' : 'ok';
    return verdict;
  };
}
