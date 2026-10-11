import { describe, expect, it } from 'vitest';
import { partRetryDelayMs } from './video-upload-manager';

describe('partRetryDelayMs', () => {
  // «وصل ١١٪ وفشل»: five seconds of patience lost a 5 GB upload to one blip.
  it('rides out minutes of a flaky line, not seconds', () => {
    const waits = Array.from({ length: 9 }, (_, i) => partRetryDelayMs(i + 1));
    expect(waits.slice(0, 5)).toEqual([2000, 4000, 8000, 16000, 30000]);
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3 * 60_000);
  });

  it('never waits longer than 30 s between two tries', () => {
    expect(partRetryDelayMs(50)).toBe(30_000);
  });
});
