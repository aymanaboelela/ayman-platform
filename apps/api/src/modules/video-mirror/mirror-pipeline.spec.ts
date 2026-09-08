import { describe, expect, it } from '@jest/globals';
import {
  MIRROR_HEIGHTS,
  VideoMirrorStatusSchema,
  mirrorPlaylistUrl,
  mirrorPrefix,
} from '@ayman/contracts/video';
import { VideoMirrorStatus } from '../../generated/prisma/enums';
import { chooseRenditions, hlsArgs, type YtFormat } from './mirror-pipeline';
import { mirrorConfigFrom } from './mirror-config';
import type { Env } from '../../config/env';

/** A YouTube-shaped format list: H.264 video-only rungs plus an AAC track. */
function formats(...heights: number[]): YtFormat[] {
  return [
    ...heights.map((height, i) => ({
      format_id: `v${height}`,
      vcodec: 'avc1.4d401f',
      acodec: 'none',
      height,
      tbr: 500 + i,
    })),
    { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', height: null, tbr: 129 },
  ];
}

describe('chooseRenditions', () => {
  it('builds a rung per available height, tallest first', () => {
    const chosen = chooseRenditions(formats(360, 480, 720, 1080));
    expect(chosen?.video.map((r) => r.height)).toEqual([1080, 720, 480, 360]);
    expect(chosen?.audioFormatId).toBe('140');
  });

  it('does not invent rungs a 480p source does not have', () => {
    /*
     * The tempting rule — "best format at or below this height" — produces a
     * ladder that lies: 480p bytes listed three times as 1080p, 720p and
     * 480p. The player would then burn its bandwidth estimate switching
     * between three identical streams and a student on a good connection
     * would be told they are watching 1080p.
     */
    const chosen = chooseRenditions(formats(360, 480));
    expect(chosen?.video.map((r) => r.height)).toEqual([480, 360]);
  });

  it('refuses a video YouTube publishes only as VP9 or AV1', () => {
    // Real, and it must fail LOUDLY rather than silently producing a ladder
    // iOS Safari cannot decode: HLS on iOS is H.264/HEVC only.
    const vp9: YtFormat[] = [
      { format_id: '248', vcodec: 'vp09.00.40.08', acodec: 'none', height: 1080, tbr: 2000 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', height: null, tbr: 129 },
    ];
    expect(chooseRenditions(vp9)).toBeNull();
  });

  it('refuses a video with no AAC audio at all', () => {
    const noAudio = formats(720).filter((f) => f.format_id !== '140');
    expect(chooseRenditions(noAudio)).toBeNull();
  });

  it('prefers the fatter encode when YouTube publishes two of one rung', () => {
    const twin: YtFormat[] = [
      { format_id: 'thin', vcodec: 'avc1.4d4020', acodec: 'none', height: 720, tbr: 900 },
      { format_id: 'fat', vcodec: 'avc1.4d4020', acodec: 'none', height: 720, tbr: 1900 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', height: null, tbr: 129 },
    ];
    expect(chooseRenditions(twin)?.video[0]?.formatId).toBe('fat');
  });
});

describe('hlsArgs', () => {
  const args = hlsArgs(['/t/v1080.mp4', '/t/v720.mp4', '/t/v480.mp4'], '/t/audio.m4a', '/t/out');

  it('maps the audio stream once PER VARIANT, not once in total', () => {
    /*
     * The failure this asserts is silent and total: map the audio once and
     * ffmpeg still writes a valid master playlist with three rungs — the
     * second and third of which have no audio track. Nobody notices until a
     * student's connection drops them off the top rung mid-lesson and the
     * teacher's voice disappears.
     */
    const audioMaps = args.filter((a, i) => a === '3:a:0' && args[i - 1] === '-map');
    expect(audioMaps).toHaveLength(3);

    expect(args.filter((a, i) => args[i - 1] === '-map' && a.endsWith(':v:0'))).toEqual([
      '0:v:0',
      '1:v:0',
      '2:v:0',
    ]);
  });

  it('pairs each video stream with its own audio in var_stream_map', () => {
    const map = args[args.indexOf('-var_stream_map') + 1];
    expect(map).toBe('v:0,a:0 v:1,a:1 v:2,a:2');
  });

  it('never re-encodes', () => {
    // The entire economic and quality argument for the feature. A `-c:v
    // libx264` slipping in here turns seconds of CPU per lecture into hours
    // and makes the copy visibly worse than the YouTube it replaces.
    expect(args[args.indexOf('-c') + 1]).toBe('copy');
    expect(args).not.toContain('libx264');
  });

  it('writes fMP4 segments and a master playlist', () => {
    expect(args[args.indexOf('-hls_segment_type') + 1]).toBe('fmp4');
    expect(args[args.indexOf('-master_pl_name') + 1]).toBe('master.m3u8');
    expect(args[args.indexOf('-hls_playlist_type') + 1]).toBe('vod');
  });
});

describe('mirror keys and URLs', () => {
  it('keys by the YouTube id, so one video attached twice is one copy', () => {
    expect(mirrorPrefix('WndSPGcPmfM')).toBe('v/WndSPGcPmfM');
  });

  it('refuses anything that is not an 11-character id', () => {
    // The value that would be a path traversal in an object key, and the one
    // that reaches `execFile` in the pipeline.
    expect(() => mirrorPrefix('../../etc/passwd')).toThrow();
    expect(() => mirrorPrefix('https://youtu.be/WndSPGcPmfM')).toThrow();
  });

  it('builds the playlist URL without doubling the slash', () => {
    expect(mirrorPlaylistUrl('https://video.example.test/', 'WndSPGcPmfM')).toBe(
      'https://video.example.test/v/WndSPGcPmfM/master.m3u8',
    );
    expect(mirrorPlaylistUrl('https://video.example.test', 'WndSPGcPmfM')).toBe(
      'https://video.example.test/v/WndSPGcPmfM/master.m3u8',
    );
  });
});

describe('the status enum', () => {
  it('matches the database enum exactly', () => {
    /*
     * Two declarations of one set — Prisma's `VideoMirrorStatus` and the
     * contract's Zod enum. A member added to one and not the other is a
     * runtime 500 on a row nobody can explain, and it typechecks fine on both
     * sides until then.
     */
    expect([...VideoMirrorStatusSchema.options].sort()).toEqual(
      Object.values(VideoMirrorStatus).sort(),
    );
  });
});

describe('the ladder', () => {
  it('stops at 1080p, the tallest H.264 YouTube publishes', () => {
    // Above this YouTube is VP9/AV1 only, which would mean a real transcode
    // and a codec iOS cannot play inside HLS.
    expect(Math.max(...MIRROR_HEIGHTS)).toBe(1080);
  });
});

describe('mirrorConfigFrom', () => {
  const full = {
    VIDEO_MIRROR_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    VIDEO_MIRROR_BUCKET: 'bucket',
    VIDEO_MIRROR_ACCESS_KEY_ID: 'key',
    VIDEO_MIRROR_SECRET_ACCESS_KEY: 'secret',
    VIDEO_MIRROR_PUBLIC_URL: 'https://video.example.test/',
    VIDEO_MIRROR_CONCURRENCY: 1,
  } as unknown as Env;

  it('is off, not broken, when nothing is configured', () => {
    // Local development, CI, and the platform as it shipped before this
    // existed. The worker never runs and every player falls back to YouTube.
    expect(mirrorConfigFrom({ VIDEO_MIRROR_CONCURRENCY: 1 } as unknown as Env)).toBeNull();
  });

  it('trims the trailing slash off the public origin', () => {
    // A CSP source with a trailing slash is a PATH pattern and matches
    // nothing, and a doubled slash in a playlist URL is a 404 on some CDNs.
    expect(mirrorConfigFrom(full)?.publicUrl).toBe('https://video.example.test');
  });

  it('refuses a half-configured bucket rather than silently disabling', () => {
    /*
     * The failure mode this exists to make impossible: credentials without a
     * public origin means a worker that fills a bucket no student can read,
     * and a public origin without credentials means an origin serving 404s.
     * Both look like success in every log for days, and surface as «الفيديو
     * مش شغال» from one school.
     */
    const { VIDEO_MIRROR_SECRET_ACCESS_KEY: _omitted, ...half } = full;
    expect(() => mirrorConfigFrom(half as unknown as Env)).toThrow(/half-configured/);
  });
});
