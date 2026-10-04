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
  PASSTHROUGH_MAX_KBPS,
  canPassThrough,
  encodedFraction,
  passthroughArgs,
  posterArgs,
  readMasterVariants,
  readMediaPlaylist,
  readProbe,
  transcodeArgs,
  variantBandwidth,
  withMeasuredBandwidth,
} from './upload-pipeline';
import { videoKey, videoKeyUri } from './video-key';

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
    expect(readProbe(probeJson({}))).toMatchObject({
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
    expect(ladderFor(1080).map((rung) => rung.height)).toEqual([720, 480, 360]);
  });

  // 2026-10-04: a 1080 rung on a shared VPS took every stack down. A 4K or
  // 1080 source still tops out at 720 — the ceiling is the ladder, not the file.
  it('never publishes above 720, whatever the source', () => {
    expect(ladderFor(2160)[0]?.height).toBe(720);
    expect(Math.max(...UPLOAD_LADDER.map((rung) => rung.height))).toBe(720);
  });

  it('decides a portrait lecture on its height, not on the smaller axis', () => {
    // 1080×1920 portrait: the HEIGHT is 1920, so the top rung (720) is
    // legitimately below the source and belongs. Deciding on the smaller axis
    // (1080) would give the same answer today and the wrong one the day the
    // ladder grows again — so the assertion is on a source the axes disagree on.
    expect(ladderFor(1920)[0]?.height).toBe(720);
    expect(ladderFor(1920)).toHaveLength(3);
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
    expect(filter.startsWith('[0:v]split=3')).toBe(true);
  });

  it('scales by height only, so the source aspect ratio survives', () => {
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('scale=-2:720');
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
    expect(joined).toContain('-maxrate:v:0 3000k');
    expect(joined).toContain('-bufsize:v:0 6000k');
    expect(joined).toContain('-maxrate:v:2 700k');
    expect(joined).toContain('-b:a:0 128k');
    expect(joined).toContain('-b:a:2 64k');
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
    expect(args[args.indexOf('-var_stream_map') + 1]).toBe('v:0,a:0 v:1,a:1 v:2,a:2');
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

describe('transcodeArgs — encrypted', () => {
  const rungs = ladderFor(1080);
  const plain = transcodeArgs('/tmp/src', rungs, '/tmp/out', true, 0);
  const encrypted = transcodeArgs('/tmp/src', rungs, '/tmp/out', true, 0, '/tmp/work/video.keyinfo');

  /*
   * ffmpeg refuses an encrypted fMP4 («Encrypted fmp4 not yet supported»), so
   * the one thing that must never happen is the key flag riding along with
   * fmp4 — that is an encode that fails after the whole upload.
   */
  it('switches to MPEG-TS with the key file, and only when there is one', () => {
    expect(encrypted[encrypted.indexOf('-hls_segment_type') + 1]).toBe('mpegts');
    expect(encrypted[encrypted.indexOf('-hls_key_info_file') + 1]).toBe('/tmp/work/video.keyinfo');
    expect(encrypted.join(' ')).toContain('seg_%03d.ts');
    expect(plain[plain.indexOf('-hls_segment_type') + 1]).toBe('fmp4');
    expect(plain).not.toContain('-hls_key_info_file');
  });
});

describe('videoKey', () => {
  it('is 16 bytes, stable for one video, and different for the next', () => {
    const one = videoKey('s'.repeat(40), 'a'.repeat(32));
    expect(one).toHaveLength(16);
    expect(videoKey('s'.repeat(40), 'a'.repeat(32)).equals(one)).toBe(true);
    expect(videoKey('s'.repeat(40), 'b'.repeat(32)).equals(one)).toBe(false);
    expect(videoKey('t'.repeat(40), 'a'.repeat(32)).equals(one)).toBe(false);
  });

  it('points players at the SITE, never at the bucket', () => {
    expect(videoKeyUri('https://x.com/', 'a'.repeat(32))).toBe(`https://x.com/api/videos/${'a'.repeat(32)}/key`);
  });
});

describe('encodedFraction — the bar during the encode', () => {
  const segs = (n: number) => Array.from({ length: n }, (_, i) => `seg_${String(i).padStart(3, '0')}.ts`);

  it('moves with the segments on disk — 100 × 6 s of a 1 h lecture is a sixth', () => {
    expect(encodedFraction(segs(100), 3600)).toBeCloseTo(1 / 6);
  });

  it('counts only segments — not the playlist ffmpeg rewrites beside them', () => {
    expect(encodedFraction([...segs(10), 'index.m3u8'], 600)).toBeCloseTo(0.1);
  });

  it('never says done while ffmpeg is still running', () => {
    expect(encodedFraction(segs(700), 3600)).toBe(0.99);
  });

  it('is 0 for a duration ffprobe could not read', () => {
    expect(encodedFraction(segs(5), 0)).toBe(0);
  });
});

/**
 * «أنا مش عاوز معالجة، أنا اللي هرفعه HD» — a file already fit to stream is
 * published as it is. Each case below is a file that would play for the
 * teacher and fail for a student if it were copied.
 */
describe('canPassThrough', () => {
  const ready = {
    width: 1920,
    height: 1080,
    durationSeconds: 3600,
    hasAudio: true,
    videoCodec: 'h264',
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    bitRate: 3_000_000,
    rotated: false,
  };

  it('publishes an H.264 export at a sane rate as it is', () => {
    expect(canPassThrough(ready)).toBe(true);
    expect(canPassThrough({ ...ready, hasAudio: false, audioCodec: null })).toBe(true);
  });

  // The owner's own «مضغوطه» file on 2026-10-04: HEVC 1080p at 9.6 Mbit/s.
  it('encodes HEVC — Chrome on most students\' devices cannot play it', () => {
    expect(canPassThrough({ ...ready, videoCodec: 'hevc', bitRate: 9_775_833 })).toBe(false);
  });

  it('encodes a file too heavy to be the only rung', () => {
    expect(canPassThrough({ ...ready, bitRate: PASSTHROUGH_MAX_KBPS * 1000 + 1 })).toBe(false);
    expect(canPassThrough({ ...ready, bitRate: null })).toBe(false);
  });

  it('encodes what would play black, silent, sideways or oversized', () => {
    expect(canPassThrough({ ...ready, pixelFormat: 'yuv420p10le' })).toBe(false);
    expect(canPassThrough({ ...ready, audioCodec: 'opus' })).toBe(false);
    expect(canPassThrough({ ...ready, rotated: true })).toBe(false);
    expect(canPassThrough({ ...ready, width: 3840, height: 2160 })).toBe(false);
  });

  it('reads codec, pixel format, rate and rotation from ffprobe', () => {
    const probe = readProbe(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1280, height: 720 },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
        format: { duration: '60', bit_rate: '2500000' },
      }),
    );
    expect(probe).toMatchObject({ videoCodec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', bitRate: 2_500_000, rotated: false });
    expect(readProbe(probeJson({ rotation: 90 })).rotated).toBe(true);
  });
});

describe('passthroughArgs', () => {
  const plain = passthroughArgs('/tmp/src', '/tmp/out', true);
  const encrypted = passthroughArgs('/tmp/src', '/tmp/out', true, '/tmp/work/video.keyinfo');

  it('copies the streams — no encoder, no filter, no CPU', () => {
    expect(plain.join(' ')).toContain('-c copy');
    expect(plain).not.toContain('libx264');
    expect(plain).not.toContain('-filter_complex');
  });

  it('writes the same layout as an encode, so nothing downstream can tell', () => {
    expect(plain[plain.indexOf('-master_pl_name') + 1]).toBe('master.m3u8');
    expect(plain[plain.length - 1]).toBe('/tmp/out/%v/index.m3u8');
    expect(plain[plain.indexOf('-var_stream_map') + 1]).toBe('v:0,a:0');
    expect(passthroughArgs('/tmp/src', '/tmp/out', false)[plain.indexOf('-var_stream_map')]).toBeDefined();
  });

  it('encrypts into MPEG-TS when given a key, like the encode does', () => {
    expect(encrypted[encrypted.indexOf('-hls_segment_type') + 1]).toBe('mpegts');
    expect(encrypted[encrypted.indexOf('-hls_key_info_file') + 1]).toBe('/tmp/work/video.keyinfo');
  });
});
