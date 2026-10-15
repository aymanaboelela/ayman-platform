import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/youtube', () => ({ loadYouTubeIframeApi: vi.fn() }));
vi.mock('hls.js', () => ({ default: class {} }));

const { masterRungs, mayPrewarm, prewarmMirror, warmRungs } = await import('./prewarm');

const FOUR_RUNGS = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=6000960,AVERAGE-BANDWIDTH=5919309,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
  '0/index.m3u8',
  '',
  '#EXT-X-STREAM-INF:BANDWIDTH=1470920,AVERAGE-BANDWIDTH=1447442,RESOLUTION=1280x720',
  '1/index.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=608115,RESOLUTION=854x480',
  '2/index.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=379561,RESOLUTION=640x360',
  '3/index.m3u8',
].join('\n');

describe('masterRungs', () => {
  it('reads BANDWIDTH, never AVERAGE-BANDWIDTH, and pairs it with its own playlist', () => {
    expect(masterRungs(FOUR_RUNGS)).toEqual([
      { uri: '0/index.m3u8', bandwidth: 6000960 },
      { uri: '1/index.m3u8', bandwidth: 1470920 },
      { uri: '2/index.m3u8', bandwidth: 608115 },
      { uri: '3/index.m3u8', bandwidth: 379561 },
    ]);
  });
});

describe('warmRungs', () => {
  it('warms the light rungs and leaves the heavy one for when the player asks', () => {
    expect(warmRungs(FOUR_RUNGS)).toEqual(['1/index.m3u8', '2/index.m3u8', '3/index.m3u8']);
  });

  it('warms the one rung of a lecture published as it is — it is the only way in', () => {
    const single = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5252992,RESOLUTION=1920x1080\n0/index.m3u8\n';
    expect(warmRungs(single)).toEqual(['0/index.m3u8']);
  });

  it('warms the lightest when every rung is heavy', () => {
    const heavy = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=9000000\n0/i.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000\n1/i.m3u8\n';
    expect(warmRungs(heavy)).toEqual(['1/i.m3u8']);
  });

  it('warms nothing from a master that lists no rung', () => {
    expect(warmRungs('#EXTM3U\n')).toEqual([]);
  });
});

describe('mayPrewarm', () => {
  it('stays off on data saver and on a crawling connection', () => {
    expect(mayPrewarm({ saveData: true })).toBe(false);
    expect(mayPrewarm({ effectiveType: '2g' })).toBe(false);
    expect(mayPrewarm({ effectiveType: 'slow-2g' })).toBe(false);
  });

  it('runs on everything else, and where the browser cannot tell', () => {
    expect(mayPrewarm({ effectiveType: '4g' })).toBe(true);
    expect(mayPrewarm(undefined)).toBe(true);
  });
});

describe('prewarmMirror', () => {
  const URL_ = 'https://video.example.test/v/abc/master.m3u8?l=2&r=3';

  it('fetches the master, then each light rung relative to it — query and all', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('master') ? new Response(FOUR_RUNGS) : new Response('#EXTM3U'),
    );
    await prewarmMirror(URL_, fetcher as unknown as typeof fetch);
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      URL_,
      'https://video.example.test/v/abc/1/index.m3u8',
      'https://video.example.test/v/abc/2/index.m3u8',
      'https://video.example.test/v/abc/3/index.m3u8',
    ]);
  });

  it('swallows every failure — a head start is not a dependency', async () => {
    await expect(prewarmMirror(URL_, vi.fn().mockRejectedValue(new Error('offline')))).resolves.toBeUndefined();
    await expect(
      prewarmMirror(URL_, vi.fn().mockResolvedValue(new Response('nope', { status: 404 }))),
    ).resolves.toBeUndefined();
  });
});
