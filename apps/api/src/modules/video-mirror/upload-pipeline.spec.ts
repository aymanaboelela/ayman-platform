import { describe, expect, it } from '@jest/globals';
import {
  UPLOAD_CRF,
  UPLOAD_ID_RE,
  UPLOAD_LADDER,
  isVideoExternalId,
  ladderFor,
  mirrorPrefix,
  uploadPartCount,
  uploadPartSize,
  uploadSourceKey,
} from '@ayman/contracts/video';
import {
  posterArgs,
  readMasterVariants,
  readMediaPlaylist,
  readProbe,
  transcodeArgs,
  variantBandwidth,
  withMeasuredBandwidth,
} from './upload-pipeline';

/** An ffprobe payload, narrowed to the fields `readProbe` reads. */
function probeJson(options: {
  width?: number;
  height?: number;
  rotation?: number;
  duration?: string;
  audio?: boolean;
  video?: boolean;
}): string {
  const streams: unknown[] = [];
  if (options.video !== false) {
    streams.push({
      codec_type: 'video',
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      ...(options.rotation === undefined
        ? {}
        : { side_data_list: [{ rotation: options.rotation }] }),
    });
  }
  if (options.audio !== false) streams.push({ codec_type: 'audio' });
  return JSON.stringify({ streams, format: { duration: options.duration ?? '3600.5' } });
}

describe('readProbe', () => {
  it('reads the display size, duration and audio presence', () => {
    expect(readProbe(probeJson({}))).toEqual({
      width: 1920,
      height: 1080,
      durationSeconds: 3601,
      hasAudio: true,
    });
  });

  /*
   * The one that matters. A lecture filmed on a phone is STORED landscape with
   * a rotate tag and ffprobe reports the stored size. Choosing a ladder from
   * 1920×1080 for a video every player shows as 1080×1920 puts a 1080p rung on
   * a picture 1080 wide — an upscale on every rung, at double the bitrate, for
   * a worse image than the source.
   */
  it('swaps the axes for a quarter-turned source', () => {
    const probe = readProbe(probeJson({ width: 1920, height: 1080, rotation: -90 }));
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
  });

  it('leaves a half-turned source alone — upside down is still landscape', () => {
    const probe = readProbe(probeJson({ width: 1920, height: 1080, rotation: 180 }));
    expect(probe.height).toBe(1080);
  });

  it('notices a silent source rather than assuming a track', () => {
    expect(readProbe(probeJson({ audio: false })).hasAudio).toBe(false);
  });

  it('refuses a file with no video stream, in Arabic', () => {
    expect(() => readProbe(probeJson({ video: false }))).toThrow(/مافيهوش فيديو/);
  });

  it('refuses a file whose duration will not parse', () => {
    expect(() => readProbe(probeJson({ duration: 'N/A' }))).toThrow(/مدة الفيديو/);
  });
});

describe('ladderFor', () => {
  it('never publishes a rung taller than the source', () => {
    expect(ladderFor(720).map((rung) => rung.height)).toEqual([720, 480, 360]);
    expect(ladderFor(1080).map((rung) => rung.height)).toEqual([1080, 720, 480, 360]);
  });

  it('does not invent a 1080p rung for a 1080-wide portrait lecture', () => {
    // 1080×1920 portrait: the HEIGHT is 1920, so 1080p is legitimately below
    // the source and belongs. The guard being tested is that the decision is
    // made on height, not on the smaller axis.
    expect(ladderFor(1920)[0]?.height).toBe(1080);
  });

  it('keeps one rung at the source height for a video below the ladder', () => {
    const rungs = ladderFor(240);
    expect(rungs).toHaveLength(1);
    expect(rungs[0]?.height).toBe(240);
  });

  it('rounds an odd source height down to even — H.264 cannot encode odd', () => {
    expect(ladderFor(241)[0]?.height).toBe(240);
  });

  it('is ordered tallest first, which is what maxHeight relies on', () => {
    const heights = UPLOAD_LADDER.map((rung) => rung.height);
    expect([...heights].sort((a, b) => b - a)).toEqual(heights);
  });
});

describe('transcodeArgs', () => {
  const rungs = ladderFor(1080);
  const args = transcodeArgs('/tmp/src', rungs, '/tmp/out', true, 0);
  const joined = args.join(' ');

  it('decodes once and splits, rather than reading the file per rung', () => {
    expect(args.filter((arg) => arg === '-i')).toHaveLength(1);
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter.startsWith('[0:v]split=4')).toBe(true);
  });

  it('scales by height only, so the source aspect ratio survives', () => {
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('scale=-2:1080');
    expect(filter).toContain('scale=-2:360');
    expect(filter).not.toContain('1920');
  });

  /*
   * The trap the mirror's own spec documents, in its second form. Mapping the
   * audio once and naming it from four variants produces a master playlist
   * that is valid and whose 2nd, 3rd and 4th rungs are SILENT — noticed only
   * when a connection drop moves a student down a rung mid-lecture.
   */
  it('maps the audio once PER VARIANT', () => {
    expect(args.filter((arg) => arg === '0:a:0')).toHaveLength(rungs.length);
  });

  /*
   * Constant quality with a ceiling. A `-b:v` here is the old fixed target
   * back: every still slide paid for motion, and the bucket stored twice what
   * the picture needed.
   */
  it('encodes at constant quality, capped per rung, with no bitrate target', () => {
    expect(joined).toContain(`-crf:v ${UPLOAD_CRF}`);
    expect(args.some((arg) => arg.startsWith('-b:v'))).toBe(false);
    expect(joined).toContain('-maxrate:v:0 4200k');
    expect(joined).toContain('-bufsize:v:0 8400k');
    expect(joined).toContain('-maxrate:v:3 700k');
    expect(joined).toContain('-b:a:0 128k');
    expect(joined).toContain('-b:a:3 64k');
  });

  /*
   * Adaptive streaming only works if every rung can be cut at the same
   * instants. Left alone, x264 puts an IDR at each scene change and detects
   * different ones per resolution; the player then stalls visibly at every
   * switch — the exact stutter on weak connections this feature exists to end.
   */
  it('forces aligned keyframes and disables scene-cut ones', () => {
    expect(joined).toContain('-force_key_frames:v expr:gte(t,n_forced*6)');
    expect(joined).toContain('-sc_threshold 0');
  });

  it('pins a pixel format every phone can decode', () => {
    expect(joined).toContain('-pix_fmt yuv420p');
    expect(joined).toContain('-profile:v high');
  });

  it('names each variant in the stream map, audio included', () => {
    expect(args[args.indexOf('-var_stream_map') + 1]).toBe('v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3');
  });

  it('packages fMP4 HLS with independent segments, like the mirror', () => {
    expect(joined).toContain('-hls_segment_type fmp4');
    expect(joined).toContain('-hls_flags independent_segments');
    expect(joined).toContain('-master_pl_name master.m3u8');
  });

  it('omits audio entirely for a silent source instead of mapping a stream that is not there', () => {
    const silent = transcodeArgs('/tmp/src', ladderFor(480), '/tmp/out', false, 0);
    expect(silent).not.toContain('0:a:0');
    expect(silent).not.toContain('-c:a');
    expect(silent[silent.indexOf('-var_stream_map') + 1]).toBe('v:0 v:1');
  });

  it('passes the thread cap through, so a shared VPS can be told to hold back', () => {
    expect(transcodeArgs('/tmp/src', rungs, '/tmp/out', true, 2).join(' ')).toContain('-threads 2');
  });
});

/*
 * Real ffmpeg 8 output for a capped-CRF 720p/360p ladder. It advertises each
 * rung's CEILING (2.4 Mbit/s + audio), which is what held students a rung or
 * two below what their connection could carry.
 */
const FFMPEG_MASTER = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  '#EXT-X-STREAM-INF:BANDWIDTH=2538248,AVERAGE-BANDWIDTH=2002897,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"',
  '0/index.m3u8',
  '',
  '#EXT-X-STREAM-INF:BANDWIDTH=790372,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"',
  '1/index.m3u8',
  '',
].join('\n');

const MEDIA_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-PLAYLIST-TYPE:VOD',
  '#EXT-X-MAP:URI="init_0.mp4"',
  '#EXTINF:6.000000,',
  'seg_000.m4s',
  '#EXTINF:6.000000,',
  'seg_001.m4s',
  '#EXTINF:1.500000,',
  'seg_002.m4s',
  '#EXT-X-ENDLIST',
].join('\n');

describe('measured bandwidth', () => {
  it('reads segments and durations, never the init map', () => {
    const media = readMediaPlaylist(MEDIA_PLAYLIST);
    expect(media.targetDurationSeconds).toBe(6);
    expect(media.segments).toEqual([
      { uri: 'seg_000.m4s', durationSeconds: 6 },
      { uri: 'seg_001.m4s', durationSeconds: 6 },
      { uri: 'seg_002.m4s', durationSeconds: 1.5 },
    ]);
  });

  it('lists the variants in master order', () => {
    expect(readMasterVariants(FFMPEG_MASTER)).toEqual(['0/index.m3u8', '1/index.m3u8']);
  });

  it('takes the peak over runs of 0.5–1.5× the target, and the mean over all', () => {
    const bandwidth = variantBandwidth(
      [
        { durationSeconds: 6, bytes: 750_000 }, // 1.0 Mbit/s
        { durationSeconds: 6, bytes: 1_500_000 }, // 2.0 Mbit/s
        // Short and dense: 4 Mbit/s alone, but 1.5 s is under half the target
        // so it does not count alone. With the one before it (7.5 s) it is
        // 2.4 Mbit/s — the real peak.
        { durationSeconds: 1.5, bytes: 750_000 },
      ],
      6,
    );
    expect(bandwidth).toEqual({ peak: 2_400_000, average: 1_777_778 });
  });

  it('falls back to the mean for a clip shorter than half a segment', () => {
    expect(variantBandwidth([{ durationSeconds: 2, bytes: 250_000 }], 6)).toEqual({
      peak: 1_000_000,
      average: 1_000_000,
    });
  });

  it('refuses to invent a number for an empty variant', () => {
    expect(variantBandwidth([], 6)).toBeNull();
  });

  it('replaces BANDWIDTH and AVERAGE-BANDWIDTH and leaves everything else alone', () => {
    const rewritten = withMeasuredBandwidth(
      FFMPEG_MASTER,
      new Map([
        ['0/index.m3u8', { peak: 1_900_000, average: 1_100_000 }],
        ['1/index.m3u8', { peak: 420_000, average: 300_000 }],
      ]),
    );
    expect(rewritten).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=1900000,AVERAGE-BANDWIDTH=1100000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"',
    );
    // ffmpeg 5.1 — the version in the API image — may not write the average
    // at all; it is inserted, not skipped.
    expect(rewritten).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=420000,AVERAGE-BANDWIDTH=300000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2"',
    );
    expect(readMasterVariants(rewritten)).toEqual(['0/index.m3u8', '1/index.m3u8']);
  });

  it('keeps what ffmpeg wrote for a variant it could not measure', () => {
    const rewritten = withMeasuredBandwidth(
      FFMPEG_MASTER,
      new Map([['1/index.m3u8', { peak: 420_000, average: 300_000 }]]),
    );
    expect(rewritten).toContain('BANDWIDTH=2538248,AVERAGE-BANDWIDTH=2002897,');
  });
});

describe('posterArgs', () => {
  /*
   * `-ss` BEFORE `-i` is an input option: ffmpeg seeks. After `-i` it is an
   * output option and ffmpeg decodes everything up to the timestamp first,
   * which on a two-hour lecture is minutes of CPU for one JPEG.
   */
  it('seeks rather than decoding up to the frame', () => {
    const args = posterArgs('/tmp/src', 42, '/tmp/poster.jpg');
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toContain('-frames:v');
  });
});

describe('upload ids and keys', () => {
  const id = 'a'.repeat(32);

  it('accepts both id shapes under one object namespace', () => {
    expect(isVideoExternalId(id)).toBe(true);
    expect(isVideoExternalId('dQw4w9WgXcQ')).toBe(true);
    expect(isVideoExternalId('nope')).toBe(false);
    expect(mirrorPrefix(id)).toBe(`v/${id}`);
    expect(mirrorPrefix('dQw4w9WgXcQ')).toBe('v/dQw4w9WgXcQ');
  });

  it('cannot be talked into a key outside the prefix', () => {
    expect(UPLOAD_ID_RE.test('../../etc/passwd')).toBe(false);
    expect(() => uploadSourceKey('../evil')).toThrow();
    expect(() => mirrorPrefix('../evil')).toThrow();
  });

  /*
   * The source sits OUTSIDE `v/`: everything under `v/` is served to students
   * with a one-year immutable cache, and a master file that is deleted the
   * moment the ladder is ready is neither immutable nor for students.
   */
  it('keeps the original file out of the served namespace', () => {
    expect(uploadSourceKey(id).startsWith('v/')).toBe(false);
    expect(uploadSourceKey(id)).toBe(`raw/${id}/source`);
  });
});

describe('upload part sizing', () => {
  it('keeps a lecture under a hundred parts, so the response stays small', () => {
    expect(uploadPartCount(2 * 1024 ** 3)).toBeLessThanOrEqual(100);
    expect(uploadPartCount(8 * 1024 ** 3)).toBeLessThanOrEqual(100);
  });

  it('never goes below S3 minimum part size', () => {
    expect(uploadPartSize(1024)).toBe(5 * 1024 * 1024);
    expect(uploadPartCount(1024)).toBe(1);
  });

  it('covers the whole file — the last part is what is left over', () => {
    const size = 700 * 1024 * 1024 + 13;
    expect(uploadPartCount(size) * uploadPartSize(size)).toBeGreaterThanOrEqual(size);
  });
});
