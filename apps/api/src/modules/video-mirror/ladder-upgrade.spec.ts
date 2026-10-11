import { describe, expect, it } from '@jest/globals';
import {
  readSegmentEncoding,
  runThrottled,
  rungsToBuild,
  sequenceIv,
  throttleDecision,
  throttleLimits,
  variantSizes,
  waitUntilCalm,
  type Throttle,
} from './ladder-upgrade';

describe('variantSizes', () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-STREAM-INF:BANDWIDTH=5252992,AVERAGE-BANDWIDTH=3751997,RESOLUTION=1920x1080',
    '0/index.m3u8',
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=914688,RESOLUTION=640x360',
    '1/index.m3u8',
    '',
  ].join('\n');

  it('pairs every rung with its own playlist and size', () => {
    expect(variantSizes(master)).toEqual([
      { uri: '0/index.m3u8', width: 1920, height: 1080 },
      { uri: '1/index.m3u8', width: 640, height: 360 },
    ]);
  });
});

describe('rungsToBuild', () => {
  it('builds every rung below a 1080 source that is not already there', () => {
    expect(rungsToBuild([1080], 1080).map((r) => r.height)).toEqual([720, 480, 360]);
  });

  it('skips a rung the master already lists — lecture 5 already has a 360', () => {
    expect(rungsToBuild([1080, 360], 1080).map((r) => r.height)).toEqual([720, 480]);
  });

  it('never builds a rung taller than the source', () => {
    expect(rungsToBuild([720], 720).map((r) => r.height)).toEqual([480, 360]);
    expect(rungsToBuild([360], 360)).toEqual([]);
  });
});

describe('readSegmentEncoding', () => {
  it('reads the explicit IV ffmpeg writes — the same one for every segment', () => {
    const playlist =
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://x/api/videos/abc/key",IV=0x00000000000000000000000000000000\n#EXTINF:6,\nseg_000.ts\n';
    const encoding = readSegmentEncoding(playlist);
    expect(encoding.encrypted).toBe(true);
    expect(encoding.iv?.length).toBe(16);
    expect(encoding.init).toBeNull();
  });

  it('knows an unencrypted fMP4 playlist and its init segment', () => {
    const encoding = readSegmentEncoding('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg_000.m4s\n');
    expect(encoding).toEqual({ encrypted: false, iv: null, init: 'init.mp4' });
  });

  it('falls back to the sequence number when the playlist names no IV', () => {
    expect(readSegmentEncoding('#EXT-X-KEY:METHOD=AES-128,URI="k"\n').iv).toBeNull();
    expect(sequenceIv(5).toString('hex')).toBe('00000000000000000000000000000005');
  });
});

describe('throttleLimits', () => {
  it('pauses at 90% of the cores, and resumes only with the encoder\'s own threads added back', () => {
    const limits = throttleLimits(4, 2);
    expect(limits.pauseAbove).toBeCloseTo(3.6, 5);
    // Resuming adds ~2 to the load: below this, load + 2 stays under the pause line.
    expect(limits.resumeBelow).toBeCloseTo(1.1, 5);
    expect(limits.resumeBelow + 2).toBeLessThan(limits.pauseAbove);
  });

  it('never asks for a load below zero on a tiny box', () => {
    expect(throttleLimits(1, 2).resumeBelow).toBeGreaterThan(0);
  });
});

describe('throttleDecision', () => {
  const limits = { pauseAbove: 3.6, resumeBelow: 1.1, minPauseMs: 30_000 };

  it('keeps going while the box is under the line', () => {
    expect(throttleDecision(2.5, false, 0, limits)).toBe('keep');
  });

  it('pauses above the line', () => {
    expect(throttleDecision(3.7, false, 0, limits)).toBe('pause');
  });

  it('stays paused in the gap between the lines — no pause/resume flapping', () => {
    expect(throttleDecision(2.0, true, 120_000, limits)).toBe('keep');
  });

  it('stays paused until the pause has lasted long enough to mean something', () => {
    // The load average lags what it measures: a quiet reading 5 s after the
    // pause is the encoder\'s own threads draining, not the server calming.
    expect(throttleDecision(0.5, true, 5_000, limits)).toBe('keep');
    expect(throttleDecision(0.5, true, 31_000, limits)).toBe('resume');
  });
});

describe('runThrottled', () => {
  function throttleWith(loads: number[], events: boolean[]): Throttle {
    let i = 0;
    return {
      limits: { pauseAbove: 3.6, resumeBelow: 1.1, minPauseMs: 0 },
      load: () => loads[Math.min(i++, loads.length - 1)]!,
      pollMs: 40,
      onWaiting: (waiting) => void events.push(waiting),
    };
  }

  it('stops the process when the load climbs and lets it finish once the load drops', async () => {
    const events: boolean[] = [];
    // calm, busy (pause), busy, calm (resume), then whatever.
    await runThrottled('sleep', ['0.6'], throttleWith([0.5, 5, 5, 0.2, 0.2], events), {
      renice: false,
      timeoutMs: 10_000,
    });
    expect(events).toEqual([true, false]);
  });

  it('does not touch a process on a calm box', async () => {
    const events: boolean[] = [];
    await runThrottled('sleep', ['0.2'], throttleWith([0.5], events), { renice: false, timeoutMs: 10_000 });
    expect(events).toEqual([]);
  });

  it('rejects with the tail of stderr when the command fails', async () => {
    await expect(
      runThrottled('sh', ['-c', 'echo boom >&2; exit 3'], throttleWith([0.5], []), { renice: false, timeoutMs: 10_000 }),
    ).rejects.toThrow(/boom/);
  });

  it('kills a process that outlives its deadline — even a stopped one', async () => {
    const events: boolean[] = [];
    await expect(
      runThrottled('sleep', ['30'], throttleWith([9, 9, 9, 9, 9, 9], events), { renice: false, timeoutMs: 400 }),
    ).rejects.toThrow(/وقت/);
    // It had been stopped, and the deadline lets it go again before it dies.
    expect(events).toEqual([true, false]);
  });
});

describe('waitUntilCalm', () => {
  it('waits out a busy box before something heavy starts, and says so', async () => {
    const events: boolean[] = [];
    let i = 0;
    const loads = [4, 4, 0.2];
    await waitUntilCalm({
      limits: { pauseAbove: 3.6, resumeBelow: 1.1, minPauseMs: 0 },
      load: () => loads[Math.min(i++, loads.length - 1)]!,
      pollMs: 20,
      onWaiting: (waiting) => void events.push(waiting),
    });
    expect(events).toEqual([true, false]);
  });
});
