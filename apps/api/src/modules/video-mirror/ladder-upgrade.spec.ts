import { describe, expect, it } from '@jest/globals';
import { readSegmentEncoding, rungsToBuild, sequenceIv, variantSizes } from './ladder-upgrade';

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
