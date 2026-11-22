import { describe, expect, it } from 'vitest';
import { createFrameSampler } from './frame-sampler';

function feed(push: ReturnType<typeof createFrameSampler>, gapMs: number, frames: number, visible = true) {
  let t = 1000;
  let verdict = push(t, visible);
  for (let i = 0; i < frames; i += 1) {
    t += gapMs;
    verdict = push(t, visible);
  }
  return verdict;
}

describe('createFrameSampler', () => {
  it('passes a 60 Hz page', () => {
    expect(feed(createFrameSampler(5, 30), 16.7, 40)).toBe('ok');
  });

  it('flags a page stuck around 20 fps', () => {
    expect(feed(createFrameSampler(5, 30), 50, 40)).toBe('slow');
  });

  it('stays pending until warm-up and sample are both done', () => {
    expect(feed(createFrameSampler(5, 30), 50, 30)).toBe('pending');
  });

  // Chrome throttles rAF to ~1 Hz in an occluded tab — that is not the GPU.
  it('ignores frames while hidden and gaps of a backgrounded tab', () => {
    expect(feed(createFrameSampler(5, 30), 50, 100, false)).toBe('pending');
    expect(feed(createFrameSampler(5, 30), 1000, 100)).toBe('pending');
  });

  it('keeps its verdict once reached', () => {
    const push = createFrameSampler(1, 3);
    feed(push, 16.7, 10);
    expect(push(999_999, true)).toBe('ok');
  });
});
