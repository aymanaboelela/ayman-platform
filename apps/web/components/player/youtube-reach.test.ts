import { describe, expect, it, vi } from 'vitest';
import { probeYouTube } from './youtube-reach';

describe('probeYouTube', () => {
  it('asks both of YouTube\'s hosts — the video\'s thumbnail and youtube.com itself', async () => {
    const load = vi.fn(async (_url: string, _timeoutMs: number) => true);
    await probeYouTube('WndSPGcPmfM', { load });
    expect(load.mock.calls.map((call) => call[0])).toEqual([
      'https://i.ytimg.com/vi/WndSPGcPmfM/default.jpg',
      'https://www.youtube.com/favicon.ico',
    ]);
  });

  it('is reachable only when both answer', async () => {
    expect(await probeYouTube('WndSPGcPmfM', { load: async () => true })).toBe('ok');
  });

  it('is blocked when either host fails — a filter can carry one and not the other', async () => {
    expect(await probeYouTube('WndSPGcPmfM', { load: async (url) => !url.includes('youtube.com') })).toBe('blocked');
    expect(await probeYouTube('WndSPGcPmfM', { load: async (url) => !url.includes('ytimg') })).toBe('blocked');
  });

  it('counts a loader that throws as blocked, never as an exception in the player', async () => {
    expect(
      await probeYouTube('WndSPGcPmfM', {
        load: async () => {
          throw new Error('boom');
        },
      }),
    ).toBe('blocked');
  });
});
