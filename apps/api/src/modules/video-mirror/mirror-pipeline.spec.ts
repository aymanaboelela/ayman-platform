import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  MIRROR_MAX_PIXELS,
  VideoMirrorStatusSchema,
  mirrorPlaylistUrl,
  mirrorPrefix,
} from '@ayman/contracts/video';
import { VideoMirrorStatus } from '../../generated/prisma/enums';
import {
  DEFAULT_TOOLS,
  adoptableLadder,
  chooseRenditions,
  clientArgs,
  hlsArgs,
  mirrorVideo,
  type MirrorTools,
  type YtFormat,
} from './mirror-pipeline';
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
      width: Math.round((height * 16) / 9),
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

  it('takes an ultra-wide lecture, whose rungs are not 16:9 heights at all', () => {
    /*
     * The bug this replaced. YouTube encodes to bitrate TIERS and fits the
     * source's aspect ratio inside each one, so a 2:1 lecture — a slide deck
     * with a camera inset, which is most of them — publishes its 480p tier as
     * 854×394 and its 360p as 640×296.
     *
     * The first version of `chooseRenditions` matched `height === 480 | 360`
     * and found NOTHING, so a real ثانوية عامة physics lecture would have been
     * recorded as «يوتيوب مش بيوفّر نسخة H.264» with its H.264 sitting in the
     * format list. These are the actual numbers from that video.
     */
    const ultrawide: YtFormat[] = [
      { format_id: '135', vcodec: 'avc1.4d401e', acodec: 'none', width: 854, height: 394, tbr: 372 },
      { format_id: '134', vcodec: 'avc1.4d4015', acodec: 'none', width: 640, height: 296, tbr: 182 },
      { format_id: '133', vcodec: 'avc1.4d400d', acodec: 'none', width: 426, height: 196, tbr: 79 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', height: null, tbr: 129 },
    ];
    const chosen = chooseRenditions(ultrawide);
    expect(chosen?.video.map((r) => r.height)).toEqual([394, 296, 196]);
  });

  it('refuses a rung that costs more than 1080p worth of pixels', () => {
    // A 4K upload publishes 2160p as VP9/AV1 — but the guard is an AREA, so a
    // wide-but-short frame is judged the same way a tall one is.
    const tooBig: YtFormat[] = [
      { format_id: '4k', vcodec: 'avc1.640033', acodec: 'none', width: 3840, height: 2160, tbr: 20000 },
      { format_id: '137', vcodec: 'avc1.640028', acodec: 'none', width: 1920, height: 1080, tbr: 4500 },
      { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', height: null, tbr: 129 },
    ];
    expect(chooseRenditions(tooBig)?.video.map((r) => r.height)).toEqual([1080]);
  });

  it('refuses a video YouTube publishes only as VP9 or AV1', () => {
    // Real, and it must fail LOUDLY rather than silently producing a ladder
    // iOS Safari cannot decode: HLS on iOS is H.264/HEVC only.
    const vp9: YtFormat[] = [
      { format_id: '248', vcodec: 'vp09.00.40.08', acodec: 'none', width: 1920, height: 1080, tbr: 2000 },
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
      { format_id: 'thin', vcodec: 'avc1.4d4020', acodec: 'none', width: 1280, height: 720, tbr: 900 },
      { format_id: 'fat', vcodec: 'avc1.4d4020', acodec: 'none', width: 1280, height: 720, tbr: 1900 },
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
  it('is bounded by 1080p worth of pixels, not by a height', () => {
    // A height would have been the natural way to write the cap and is the
    // thing that broke on real content — see the ultra-wide case above.
    expect(MIRROR_MAX_PIXELS).toBe(1920 * 1080);
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


describe('which YouTube client the mirror asks', () => {
  /** A stub `execFile`: yt-dlp answers per client, ffmpeg writes the master. */
  function tools(
    answers: Record<string, { formats?: YtFormat[]; refuse?: string }>,
    calls: string[][],
  ): MirrorTools {
    const exec = async (bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
      calls.push([bin, ...args]);

      if (bin === 'ffmpeg') {
        // The real ffmpeg writes the master playlist next to the variant
        // folders; the run is judged on that file existing.
        const outDir = dirname(dirname(args[args.length - 1]!));
        await writeFile(join(outDir, 'master.m3u8'), '#EXTM3U\n');
        return { stdout: '', stderr: '' };
      }

      const client =
        args.find((a) => a.startsWith('youtube:player_client='))?.split('=')[1] ?? 'default';
      const answer = answers[client];

      if (answer === undefined || answer.refuse !== undefined) {
        const error = new Error('Command failed') as Error & { stderr: string };
        error.stderr = `ERROR: [youtube] aaaaaaaaaaa: ${answer?.refuse ?? 'no answer'}\n`;
        throw error;
      }
      if (args.includes('--dump-single-json')) {
        return { stdout: JSON.stringify({ formats: answer.formats }), stderr: '' };
      }
      return { stdout: '', stderr: '' };
    };

    return { ...DEFAULT_TOOLS, exec: exec as unknown as MirrorTools['exec'] };
  }

  it('passes no client flag at all for `default`', () => {
    expect(clientArgs('default')).toEqual([]);
    expect(clientArgs('visionos')).toEqual(['--extractor-args', 'youtube:player_client=visionos']);
  });

  it('walks past a refused client, and downloads with the one that answered', async () => {
    /*
     * The production failure this exists for: from the VPS, the web clients
     * come back «Sign in to confirm you're not a bot» on the very first
     * metadata call, for every video. Falling through has to reach a client
     * that answers — and every later download has to use THAT client, because
     * format ids are minted per client.
     */
    const calls: string[][] = [];
    const result = await mirrorVideo(
      'aaaaaaaaaaa',
      tools(
        {
          visionos: { refuse: "Sign in to confirm you're not a bot" },
          android_vr: { formats: formats(360, 720) },
        },
        calls,
      ),
    );

    const probes = calls.filter((c) => c.includes('--dump-single-json'));
    expect(probes.map((c) => c.find((a) => a.startsWith('youtube:player_client=')))).toEqual([
      'youtube:player_client=visionos',
      'youtube:player_client=android_vr',
    ]);

    const downloads = calls.filter((c) => c[0] === 'yt-dlp' && c.includes('-f'));
    expect(downloads.length).toBe(3); // two rungs and the audio
    for (const call of downloads) {
      expect(call).toContain('youtube:player_client=android_vr');
    }

    expect(result.maxHeight).toBe(720);
    await result.cleanup();
  });

  it('does not settle for a client that only offers 360p when a taller one answers', async () => {
    /*
     * `android_vr`, `tv_simply` and `mweb` all reply happily and publish one
     * rung. Ordering them ahead of `visionos` would still «work» — and mirror
     * every lecture on the platform at 360p, permanently, with no failure
     * anywhere to notice.
     */
    const calls: string[][] = [];
    const result = await mirrorVideo(
      'aaaaaaaaaaa',
      tools(
        { visionos: { formats: formats(360, 720, 1080) }, android_vr: { formats: formats(360) } },
        calls,
      ),
    );

    expect(result.maxHeight).toBe(1080);
    expect(calls.filter((c) => c.includes('--dump-single-json')).length).toBe(1);
    await result.cleanup();
  });

  it('names every refusal in the error an admin reads', async () => {
    const calls: string[][] = [];
    await expect(
      mirrorVideo('aaaaaaaaaaa', tools({ visionos: { refuse: 'bot check' } }, calls)),
    ).rejects.toThrow(/visionos: .*bot check/);
  });
});


describe('adopting a ladder the bucket already holds', () => {
  /*
   * The worker cannot fill this bucket from the VPS — YouTube refuses a
   * data-centre IP outright — so the backfill runs from a laptop and the
   * objects appear with no row ever changing. Reading them back is what makes
   * those bytes a `ready` lecture instead of paid-for storage nobody serves.
   */
  const MASTER = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-STREAM-INF:BANDWIDTH=1896350,RESOLUTION=1280x720,CODECS="avc1.640020,mp4a.40.2"',
    '0/index.m3u8',
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=459418,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"',
    '1/index.m3u8',
    '',
  ].join('\n');

  const complete = new Set([
    'v/aaaaaaaaaaa/master.m3u8',
    'v/aaaaaaaaaaa/0/index.m3u8',
    'v/aaaaaaaaaaa/1/index.m3u8',
  ]);

  it('reads the tallest rung from the master playlist', () => {
    expect(adoptableLadder('v/aaaaaaaaaaa', MASTER, complete)).toBe(720);
  });

  it('refuses a prefix whose master names a rung that is not there', () => {
    /*
     * The failure this guards. An upload interrupted partway leaves the
     * master — written last — absent or its variants missing, and adopting
     * that marks the lecture `ready` with a player that stalls mid-rung.
     * Nothing else in the system would ever report it: as far as the
     * platform is concerned, the mirror worked.
     */
    const missingRung = new Set(['v/aaaaaaaaaaa/master.m3u8', 'v/aaaaaaaaaaa/0/index.m3u8']);
    expect(adoptableLadder('v/aaaaaaaaaaa', MASTER, missingRung)).toBeNull();
  });

  it('refuses a master that lists no rung at all', () => {
    expect(adoptableLadder('v/aaaaaaaaaaa', '#EXTM3U\n', complete)).toBeNull();
  });

  it('does not confuse another video\'s objects for this one', () => {
    expect(adoptableLadder('v/bbbbbbbbbbb', MASTER, complete)).toBeNull();
  });
});
