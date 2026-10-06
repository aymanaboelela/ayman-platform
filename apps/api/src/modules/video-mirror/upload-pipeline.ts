import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { MIRROR_MAX_PIXELS, UPLOAD_CRF, ladderFor, type LadderRung } from '@ayman/contracts/video';
import { IS_AYMAN } from '../../common/tenant';
import { DEFAULT_TOOLS, type MirrorResult, type MirrorTools } from './mirror-pipeline';

const run = promisify(execFile);

/**
 * ══════════════════════════════════════════════════════════════════════════
 * Packaging a lecture the instructor uploaded to us.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The sibling of `mirror-pipeline.ts`, and the one place the two genuinely
 * differ: that one is a REMUX of streams YouTube already encoded, this is a
 * real ENCODE, because nobody else has encoded these bytes for us.
 *
 * That is the whole cost of leaving YouTube, and it is worth stating plainly
 * rather than discovering on a Friday:
 *
 *   * A remux of an hour is seconds of CPU. An encode of an hour is minutes
 *     to tens of minutes per rung, on the same VPS that serves the site.
 *   * So this runs ONE video at a time, behind the same Redis lock, at the
 *     lowest scheduling priority the OS offers. A lecture uploaded at
 *     midnight being ready at half past is fine; the site going sluggish
 *     while it happens is not.
 *
 * `-preset medium`, measured rather than assumed (2026-09-28, a real lecture,
 * constant quality): `slow` came out 1–2% smaller than `medium` at the same
 * VMAF for 2–3× the CPU, so it buys nothing. `veryfast` was the old choice and
 * made sense at a fixed bitrate, where the preset only nudges quality; at
 * constant quality a faster preset spends more bits on the same picture,
 * which is the one thing this change exists to stop. The quality decision
 * itself is `UPLOAD_CRF` in `@ayman/contracts/video`.
 *
 * The price is time: an hour of lecture costs two to three times the CPU it
 * did under `veryfast`. Still one video at a time, still niced — a lecture is
 * ready later, and the site does not notice.
 *
 * ── On shelling out ───────────────────────────────────────────────────────
 * Same contract as the mirror: `execFile` with an ARGUMENT ARRAY, no shell,
 * no string interpolation into a command. The only externally-influenced
 * value that reaches ffmpeg is a path this process created from an upload id
 * that has already been matched against `UPLOAD_ID_RE`.
 */

/** What `ffprobe` tells us about the file before we decide on a ladder. */
export interface SourceProbe {
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  readonly hasAudio: boolean;
  /** ffprobe's `codec_name` — `h264`, `hevc`… */
  readonly videoCodec: string;
  readonly pixelFormat: string | null;
  /** `null` when there is no audio track. */
  readonly audioCodec: string | null;
  /** The whole file's rate, bit/s — `null` when the container does not say. */
  readonly bitRate: number | null;
  /** Carries a quarter- or half-turn tag that only a decoder applies. */
  readonly rotated: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  /** Present on phone recordings; ffmpeg applies it, so the DISPLAY size swaps. */
  side_data_list?: { rotation?: number }[];
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string };
}

/**
 * Read the source's real display dimensions and duration.
 *
 * ⚠️ `rotation` is why this is not a two-line function. A lecture filmed on a
 * phone is stored landscape with a `rotate` side-data tag, and ffprobe reports
 * the STORED width and height — 1920×1080 for a video every player shows as
 * 1080×1920. Choosing a ladder from those numbers produces rungs taller than
 * the picture and an upscale on every one of them. ffmpeg's decoder applies
 * the rotation before our filters see the frame, so the ladder has to be
 * chosen from the swapped values.
 */
export function readProbe(json: string): SourceProbe {
  const parsed = JSON.parse(json) as FfprobeOutput;
  const streams = parsed.streams ?? [];

  const video = streams.find((stream) => stream.codec_type === 'video');
  if (video === undefined || !video.width || !video.height) {
    throw new Error('الملف ده مافيهوش فيديو — اتأكد إنك رفعت الملف الصح');
  }

  const rotation = video.side_data_list?.find((entry) => typeof entry.rotation === 'number')
    ?.rotation;
  const quarterTurned = rotation !== undefined && Math.abs(rotation) % 180 === 90;

  const duration = Number.parseFloat(parsed.format?.duration ?? '');
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('مش قادرين نقرا مدة الفيديو — الملف يمكن يكون ناقص أو باظ');
  }

  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const bitRate = Number.parseInt(parsed.format?.bit_rate ?? '', 10);

  return {
    width: quarterTurned ? video.height : video.width,
    height: quarterTurned ? video.width : video.height,
    durationSeconds: Math.round(duration),
    hasAudio: audio !== undefined,
    videoCodec: video.codec_name ?? '',
    pixelFormat: video.pix_fmt ?? null,
    audioCodec: audio === undefined ? null : (audio.codec_name ?? ''),
    bitRate: Number.isFinite(bitRate) && bitRate > 0 ? bitRate : null,
    rotated: rotation !== undefined && rotation % 360 !== 0,
  };
}

/**
 * ── Publishing a file as it is ────────────────────────────────────────────
 *
 * «أنا مش عاوز معالجة، أنا اللي هرفعه HD» (the owner, 2026-10-04). An encode
 * is hours of CPU on the VPS the three stacks share, and on 2026-10-04 that
 * CPU is what took every site down. A teacher who exports the lecture right
 * on their own machine has already done the expensive part.
 *
 * So a file that is ALREADY streamable is only cut into encrypted HLS
 * segments, with `-c copy`: no decode, no encode — seconds of CPU for an hour
 * of lecture, and the picture is byte-for-byte what the teacher exported.
 *
 * "Streamable" is narrow on purpose, because each condition is a way a copied
 * file plays for the teacher and fails for a student:
 *
 *  - **H.264, 8-bit 4:2:0.** HEVC (what a phone or a "compress" preset often
 *    writes) does not play in Chrome on most of the laptops and phones a
 *    student owns, and 10-bit or 4:2:2 decodes to black on half of them. The
 *    owner's own «مضغوطه» file on 2026-10-04 was HEVC — it is exactly the
 *    file this check exists to catch.
 *  - **AAC audio, or none.** What HLS players expect in a segment.
 *  - **No rotation tag.** Only a decoder applies it; a copied stream would
 *    play sideways.
 *  - **At most 1080p worth of pixels, at most `PASSTHROUGH_MAX_KBPS`.** There
 *    is only ONE rung — no 360p to fall back to on a weak connection — so the
 *    one rung has to be light enough for a student's line and data bundle.
 *
 * Anything else is encoded as before, at 720 (`UPLOAD_LADDER`). Nothing is
 * refused: a teacher who uploads the wrong file gets a slower lecture, not a
 * broken one.
 */
export const PASSTHROUGH_MAX_KBPS = 5000;

export function canPassThrough(probe: SourceProbe): boolean {
  return (
    probe.videoCodec === 'h264' &&
    (probe.pixelFormat === 'yuv420p' || probe.pixelFormat === 'yuvj420p') &&
    (probe.audioCodec === null || probe.audioCodec === 'aac') &&
    !probe.rotated &&
    probe.width * probe.height <= MIRROR_MAX_PIXELS &&
    probe.bitRate !== null &&
    probe.bitRate <= PASSTHROUGH_MAX_KBPS * 1000
  );
}

/**
 * The ffmpeg invocation that segments an already-streamable file WITHOUT
 * re-encoding it — one variant, same layout as `transcodeArgs` writes
 * (`master.m3u8` + `0/index.m3u8`), so everything downstream (upload, the
 * bandwidth rewrite, the player) cannot tell the two apart.
 *
 * Segments are cut at the source's own keyframes, so they are only roughly
 * `SEGMENT_SECONDS` long. That is fine for one rung: equal cuts matter only
 * when a player has to switch between rungs mid-lecture.
 */
export function passthroughArgs(
  source: string,
  outDir: string,
  hasAudio: boolean,
  keyInfoFile: string | null = null,
): string[] {
  const encrypted = keyInfoFile !== null;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-map',
    '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-c',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    encrypted ? 'mpegts' : 'fmp4',
    ...(encrypted ? ['-hls_key_info_file', keyInfoFile] : []),
    '-hls_flags',
    'independent_segments',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    hasAudio ? 'v:0,a:0' : 'v:0',
    '-hls_segment_filename',
    join(outDir, '%v', encrypted ? 'seg_%03d.ts' : 'seg_%03d.m4s'),
    join(outDir, '%v', 'index.m3u8'),
  ];
}

/**
 * ── The rung a copied file lacks ──────────────────────────────────────────
 *
 * A file published as it is has ONE rung. A student whose line cannot carry
 * it has nothing to fall to — the player buffers, and that is exactly the
 * «الفيديو بيقطّع» of a 1080 copy on a weak connection (2026-10-06). So a
 * copied lecture gets one extra, small rung beside it: 360p, encoded from the
 * source. One rung at a third of the pixels of the cheapest encode on the old
 * ladder, so it costs a fraction of one — the reason publishing as-is was
 * worth having is untouched.
 *
 * ⚠️ It must be cut at EXACTLY the copied rung's segment boundaries. The copy
 * is cut at the source's own keyframes, so its segments are 5.9–6.4 s, not 6;
 * a 360 rung cut on a fixed 6 s grid would sit a fraction of a second off
 * every boundary, and the player stalls visibly at each switch — the problem
 * `transcodeArgs` forces keyframes to avoid. So the copy's playlist is read
 * first and its boundaries are forced here.
 */
export const LOW_RUNG: LadderRung = { height: 360, maxKbps: 700, audioKbps: 64 };

/** Cumulative cut times (seconds) between the segments of a media playlist; the start and the end are not cuts. */
export function segmentBoundaries(playlist: string): number[] {
  const { segments } = readMediaPlaylist(playlist);
  const cuts: number[] = [];
  let at = 0;
  for (let i = 0; i < segments.length - 1; i += 1) {
    at += segments[i]!.durationSeconds;
    cuts.push(at);
  }
  return cuts;
}

/**
 * The low rung's ffmpeg invocation: scaled, constant quality like the main
 * ladder, keyframes ONLY at `boundaries`, and an `-hls_time` shorter than any
 * gap between them — so the muxer cuts at every forced keyframe and nowhere
 * else.
 */
export function lowRungArgs(
  source: string,
  outDir: string,
  hasAudio: boolean,
  boundaries: readonly number[],
  threads: number,
  keyInfoFile: string | null = null,
): string[] {
  const encrypted = keyInfoFile !== null;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-map',
    '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-vf',
    `scale=-2:${LOW_RUNG.height}:flags=bicubic`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    String(UPLOAD_CRF),
    '-maxrate',
    `${LOW_RUNG.maxKbps}k`,
    '-bufsize',
    `${LOW_RUNG.maxKbps * 2}k`,
    // A millisecond early: the keyframe lands on the first frame at or after
    // the time, and a boundary that float-sums a hair too high would push it
    // one frame late — a cut a frame off is still a cut off.
    '-force_key_frames',
    boundaries.map((t) => Math.max(0, t - 0.001).toFixed(3)).join(','),
    // No keyframe but the forced ones.
    '-sc_threshold',
    '0',
    '-g',
    '100000',
    ...(hasAudio
      ? ['-c:a', 'aac', '-ac', '2', '-b:a', `${LOW_RUNG.audioKbps}k`]
      : []),
    '-threads',
    String(threads),
    '-f',
    'hls',
    '-hls_time',
    '1',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    encrypted ? 'mpegts' : 'fmp4',
    ...(encrypted ? ['-hls_key_info_file', keyInfoFile] : []),
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    join(outDir, encrypted ? 'seg_%03d.ts' : 'seg_%03d.m4s'),
    join(outDir, 'index.m3u8'),
  ];
}

/** `master` with the low rung listed after the copied one. */
export function withLowRung(master: string, uri: string, width: number, height: number): string {
  const base = master.endsWith('\n') ? master : `${master}\n`;
  return `${base}#EXT-X-STREAM-INF:BANDWIDTH=${LOW_RUNG.maxKbps * 1000},RESOLUTION=${width}x${height}\n${uri}\n`;
}

/** Segment length. Matches the mirror's, so both ladders behave identically. */
const SEGMENT_SECONDS = 6;

/**
 * How far the encode has got, from the segments of ONE rung already on disk.
 *
 * ⚠️ «واقف على ٢٠٪ والفيديو أصلًا اترفع». The encode is one ffmpeg call that
 * says nothing until it exits, and it is the long part — an hour of lecture can
 * take one or two hours of niced CPU. So the bar sat at the 20 it was given
 * when ffmpeg started, for hours, and read exactly like a stuck upload.
 *
 * Every rung is cut on the same forced keyframes, so the tallest one's segment
 * count times the segment length is how many seconds of the lecture are done.
 * The segment being written is counted too; capped below 1 because the file is
 * not done until ffmpeg says so.
 */
export function encodedFraction(names: readonly string[], durationSeconds: number): number {
  const segments = names.filter((name) => name.startsWith('seg_')).length;
  if (durationSeconds <= 0) return 0;
  return Math.min(0.99, (segments * SEGMENT_SECONDS) / durationSeconds);
}

/** How often the segments are counted — the admin's page polls on its own clock anyway. */
const ENCODE_POLL_MS = 15_000;

/**
 * The ffmpeg invocation that turns ONE source file into an HLS ladder.
 *
 * A pure function for the same reason `hlsArgs` is one: a mis-built ladder
 * still produces a master playlist that plays, and the rung that is silent or
 * misaligned is only found by a student, months later, on a connection bad
 * enough to switch rungs mid-lecture. It is asserted in a spec instead.
 *
 * Three things here are load-bearing and none of them is obvious:
 *
 * 1. **`split` before `scale`.** One decode feeding N scalers. Passing the
 *    input N times instead would decode the file N times, which on a
 *    two-hour lecture is most of the wall clock for no benefit.
 *
 * 2. **Every variant maps the audio for ITSELF.** Referencing `a:0` once and
 *    naming it from three variants is accepted by the CLI and produces a
 *    master playlist whose 2nd and 3rd rungs are SILENT — the mirror's spec
 *    documents the same trap, and it is the same trap.
 *
 * 3. **Forced keyframes, and `-sc_threshold 0`.** Adaptive streaming works
 *    only if every rung can be cut at the same instants. Left to itself x264
 *    puts an IDR wherever it detects a scene change, which differs per
 *    resolution, and the player then stalls visibly at every rung switch —
 *    the exact stutter this feature exists to avoid on weak connections.
 */
export function transcodeArgs(
  source: string,
  rungs: readonly LadderRung[],
  outDir: string,
  hasAudio: boolean,
  threads: number,
  /**
   * ffmpeg's `-hls_key_info_file`: key URI, key file, one per line. When
   * given, every segment is AES-128 encrypted — see `video-key.ts`.
   *
   * ⚠️ Encryption forces MPEG-TS segments. ffmpeg's HLS muxer refuses an
   * encrypted fMP4 outright («Encrypted fmp4 not yet supported»), measured
   * on 8.1. TS with AES-128 is also the one combination every player a
   * student has ever used plays: hls.js decrypts and transmuxes it, and
   * Safari has played it natively since HLS existed.
   */
  keyInfoFile: string | null = null,
): string[] {
  const n = rungs.length;
  const encrypted = keyInfoFile !== null;

  const splits = rungs.map((_, i) => `[s${i}]`).join('');
  const scales = rungs
    .map(
      (rung, i) =>
        // `-2` keeps the source aspect and rounds the width to an even number,
        // which H.264 chroma subsampling requires. `force_original_aspect_ratio`
        // is not needed — there is only one constrained dimension.
        `[s${i}]scale=-2:${rung.height}:flags=bicubic[v${i}]`,
    )
    .join(';');
  const filter = `[0:v]split=${n}${splits};${scales}`;

  const maps = rungs.flatMap((_, i) =>
    hasAudio ? ['-map', `[v${i}]`, '-map', '0:a:0'] : ['-map', `[v${i}]`],
  );

  const videoCodec = rungs.flatMap((rung, i) => [
    `-maxrate:v:${i}`,
    `${rung.maxKbps}k`,
    // Two seconds of headroom. Bigger buffers look better on paper and make
    // the first segment slower to arrive, which is the one a student waits on.
    `-bufsize:v:${i}`,
    `${rung.maxKbps * 2}k`,
  ]);

  const audioCodec = hasAudio
    ? [
        '-c:a',
        'aac',
        // Downmix on purpose: a lecture's 5.1 track is a recording accident,
        // and stereo is what every phone speaker plays anyway.
        '-ac',
        '2',
        ...rungs.flatMap((rung, i) => [`-b:a:${i}`, `${rung.audioKbps}k`]),
      ]
    : [];

  const varStreamMap = rungs
    .map((_, i) => (hasAudio ? `v:${i},a:${i}` : `v:${i}`))
    .join(' ');

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    // Overwrite: the temp directory is ours and a retry must not stop on a
    // half-written file from the attempt that crashed.
    '-y',
    '-i',
    source,
    '-filter_complex',
    filter,
    ...maps,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    // `high` — universally decodable on hardware since roughly 2010, and the
    // profile every phone in an Egyptian classroom accelerates.
    '-profile:v',
    'high',
    // Sources that are 10-bit or 4:2:2 (a decent camera) decode to a pixel
    // format most phones cannot play back. Pinning it here is what stops a
    // lecture encoding perfectly and being a black screen on half the class.
    '-pix_fmt',
    'yuv420p',
    // Constant quality with a per-rung ceiling, never a bitrate target: see
    // `UPLOAD_LADDER`.
    '-crf:v',
    String(UPLOAD_CRF),
    ...videoCodec,
    '-force_key_frames:v',
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    '-sc_threshold',
    '0',
    ...audioCodec,
    '-threads',
    String(threads),
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    encrypted ? 'mpegts' : 'fmp4',
    ...(encrypted ? ['-hls_key_info_file', keyInfoFile] : []),
    '-hls_flags',
    'independent_segments',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    varStreamMap,
    '-hls_segment_filename',
    join(outDir, '%v', encrypted ? 'seg_%03d.ts' : 'seg_%03d.m4s'),
    join(outDir, '%v', 'index.m3u8'),
  ];
}

/**
 * One frame, for the poster.
 *
 * At 10% of the way in rather than at 0:00 — the first second of a lecture is
 * a black frame, a lens cap or a hand reaching for the keyboard on almost
 * every recording, and that is the image that would end up on the course page.
 */
export function posterArgs(source: string, atSeconds: number, outFile: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    // BEFORE `-i`, so ffmpeg seeks rather than decoding everything up to the
    // timestamp. On a two-hour lecture that is the difference between
    // instant and minutes.
    '-ss',
    String(atSeconds),
    '-i',
    source,
    '-frames:v',
    '1',
    '-vf',
    'scale=-2:720',
    '-q:v',
    '4',
    outFile,
  ];
}

/**
 * ── What the master playlist promises each rung costs ─────────────────────
 *
 * The player picks a rung by comparing the student's measured bandwidth with
 * each variant's `BANDWIDTH`, and it steps UP only when the connection covers
 * that number with room to spare. ffmpeg fills it from the stream's declared
 * rate — and a constant-quality stream has none, so it falls back to the
 * CEILING. A 1080p lecture that averages 1.4 Mbit/s would then advertise
 * ~4.7, and a student on a 4 Mbit/s line would be held at 480p for a picture
 * their connection could carry at 1080p. The smaller files would have bought
 * a worse lecture.
 *
 * So once the ladder is written, each variant's numbers are replaced with
 * what its segments actually weigh: `BANDWIDTH` as RFC 8216 §4.3.4.2 defines
 * it (the peak over any run of segments lasting 0.5–1.5× the target
 * duration) and `AVERAGE-BANDWIDTH` as the whole-file mean.
 */
export interface SegmentSize {
  readonly durationSeconds: number;
  readonly bytes: number;
}

export interface VariantBandwidth {
  /** bit/s — `BANDWIDTH`. */
  readonly peak: number;
  /** bit/s — `AVERAGE-BANDWIDTH`. */
  readonly average: number;
}

export function variantBandwidth(
  segments: readonly SegmentSize[],
  targetDurationSeconds: number,
): VariantBandwidth | null {
  let totalBytes = 0;
  let totalSeconds = 0;
  for (const segment of segments) {
    totalBytes += segment.bytes;
    totalSeconds += segment.durationSeconds;
  }
  if (totalSeconds <= 0) return null;
  const average = Math.ceil((totalBytes * 8) / totalSeconds);

  let peak = 0;
  for (let i = 0; i < segments.length; i += 1) {
    let bytes = 0;
    let seconds = 0;
    for (let j = i; j < segments.length; j += 1) {
      bytes += segments[j]!.bytes;
      seconds += segments[j]!.durationSeconds;
      if (seconds > 1.5 * targetDurationSeconds) break;
      if (seconds >= 0.5 * targetDurationSeconds) {
        peak = Math.max(peak, Math.ceil((bytes * 8) / seconds));
      }
    }
  }
  // A clip shorter than half a segment has no qualifying run; its mean is the
  // only honest number. And a peak below the mean is not a peak.
  return { peak: Math.max(peak, average), average };
}

/** The target duration and segment list of one media playlist. */
export function readMediaPlaylist(text: string): {
  targetDurationSeconds: number;
  segments: { uri: string; durationSeconds: number }[];
} {
  let targetDurationSeconds = 0;
  const segments: { uri: string; durationSeconds: number }[] = [];
  let pending: number | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDurationSeconds = Number(line.slice('#EXT-X-TARGETDURATION:'.length));
    } else if (line.startsWith('#EXTINF:')) {
      pending = Number.parseFloat(line.slice('#EXTINF:'.length));
    } else if (line !== '' && !line.startsWith('#') && pending !== null) {
      segments.push({ uri: line, durationSeconds: pending });
      pending = null;
    }
  }
  return { targetDurationSeconds, segments };
}

/** The variant URIs a master playlist lists, in order. */
export function readMasterVariants(master: string): string[] {
  const uris: string[] = [];
  let expectingUri = false;
  for (const raw of master.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) expectingUri = true;
    else if (expectingUri && line !== '' && !line.startsWith('#')) {
      uris.push(line);
      expectingUri = false;
    }
  }
  return uris;
}

/**
 * `master` with each measured variant's `BANDWIDTH` and `AVERAGE-BANDWIDTH`
 * replaced. A variant missing from `measured` keeps what ffmpeg wrote.
 *
 * The attributes are matched only right after `:` or `,` — `BANDWIDTH` is a
 * suffix of `AVERAGE-BANDWIDTH`, and `CODECS="avc1…,mp4a…"` has a comma of its
 * own, so neither a bare match nor splitting on commas is safe.
 */
export function withMeasuredBandwidth(
  master: string,
  measured: ReadonlyMap<string, VariantBandwidth>,
): string {
  const lines = master.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]!.startsWith('#EXT-X-STREAM-INF:')) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j]!.trim() === '' || lines[j]!.startsWith('#'))) j += 1;
    const bandwidth = measured.get(lines[j]?.trim() ?? '');
    if (bandwidth === undefined) continue;

    let inf = lines[i]!.replace(/(?<=[:,])BANDWIDTH=\d+/, `BANDWIDTH=${bandwidth.peak}`);
    inf = /(?<=[:,])AVERAGE-BANDWIDTH=\d+/.test(inf)
      ? inf.replace(/(?<=[:,])AVERAGE-BANDWIDTH=\d+/, `AVERAGE-BANDWIDTH=${bandwidth.average}`)
      : inf.replace(
          /(?<=[:,])BANDWIDTH=\d+/,
          `BANDWIDTH=${bandwidth.peak},AVERAGE-BANDWIDTH=${bandwidth.average}`,
        );
    lines[i] = inf;
  }
  return lines.join('\n');
}

/** Measure every variant under `outDir` and rewrite its `master.m3u8`. */
async function measureMasterBandwidth(outDir: string): Promise<void> {
  const masterPath = join(outDir, 'master.m3u8');
  const master = await readFile(masterPath, 'utf8');
  const measured = new Map<string, VariantBandwidth>();
  for (const uri of readMasterVariants(master)) {
    const playlistPath = join(outDir, uri);
    const media = readMediaPlaylist(await readFile(playlistPath, 'utf8'));
    const sizes: SegmentSize[] = [];
    for (const segment of media.segments) {
      const { size } = await stat(join(dirname(playlistPath), segment.uri));
      sizes.push({ durationSeconds: segment.durationSeconds, bytes: size });
    }
    const bandwidth = variantBandwidth(sizes, media.targetDurationSeconds);
    if (bandwidth !== null) measured.set(uri, bandwidth);
  }
  await writeFile(masterPath, withMeasuredBandwidth(master, measured));
}

/** Recursively list files under `dir`, as paths relative to it. */
async function listFiles(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, root)));
    else out.push(relative(root, full));
  }
  return out.sort();
}

export interface TranscodeResult extends MirrorResult {
  readonly durationSeconds: number;
}

export interface TranscodeTools extends MirrorTools {
  readonly ffprobe: string;
  /**
   * Encoder threads. `0` lets ffmpeg use every core — which is what this
   * used to default to, and the reference VPS (4 cores, three tenant stacks)
   * measured 130-170% CPU from ONE encode alone (2026-10-04). `nice -n 19`
   * below only lowers SCHEDULING priority; it does not cap how many cores a
   * process may touch, so a single lecture could still starve every other
   * container on the box for the length of the encode.
   */
  readonly threads: number;
  /**
   * Prefix the encoder with `nice -n 19`. Scheduling priority, not a core
   * limit: ffmpeg still finishes as fast as the idle capacity allows, and
   * yields the instant a student's request needs the CPU.
   */
  readonly renice: boolean;
  /**
   * Add the 360 rung to a file published as it is (see `LOW_RUNG`). Ayman's
   * stack only: the owner asked for it for his own lectures (2026-10-06), and
   * on the other two stacks it would be encode CPU nobody chose to spend on
   * the shared VPS.
   */
  readonly lowRung: boolean;
}

export const DEFAULT_TRANSCODE_TOOLS: TranscodeTools = {
  // Spread rather than restate: `TranscodeTools` extends `MirrorTools`, and a
  // second literal of the same fields is a second place to forget one.
  ...DEFAULT_TOOLS,
  ffprobe: 'ffprobe',
  // An encode is far slower than a remux, and `medium` is two to three times
  // `veryfast`: an hour of lecture can take up to two hours of niced CPU on a
  // busy VPS, and the upload cap admits four-hour files. A timeout exists to
  // kill a HUNG ffmpeg, not a slow one — failing a lecture at 90% is worse
  // than a late one.
  timeoutMs: 12 * 60 * 60_000,
  // Half the reference VPS's 4 cores — leaves the other two for postgres,
  // redis, traefik and whichever OTHER tenant stack is sharing the same
  // physical box, so one lecture encoding never fully starves the site.
  threads: 2,
  renice: process.platform === 'linux',
  lowRung: IS_AYMAN,
};

/**
 * Package one already-downloaded source file into a ladder.
 *
 * Throws with a message fit to store in `mirror_error` and show to an admin —
 * every failure here ends up on a screen, so none of them may be a stack
 * trace, and none of them may be in English.
 */
export async function transcodeUpload(
  sourceFile: string,
  workDir: string,
  tools: TranscodeTools = DEFAULT_TRANSCODE_TOOLS,
  onStage?: (stage: 'probing' | 'encoding' | 'poster') => void,
  /** Encrypt every segment with this key, fetched by players from `uri`. */
  encryption: { key: Buffer; uri: string } | null = null,
  /** 0‥1 of the encode, every `ENCODE_POLL_MS` while ffmpeg runs. See `encodedFraction`. */
  onEncodeProgress?: (fraction: number) => void,
): Promise<TranscodeResult> {
  const exec = (bin: string, args: readonly string[]): Promise<unknown> =>
    tools.renice
      ? run('nice', ['-n', '19', bin, ...args], {
          timeout: tools.timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
        })
      : run(bin, [...args], { timeout: tools.timeoutMs, maxBuffer: 16 * 1024 * 1024 });

  onStage?.('probing');
  const probed = await run(
    tools.ffprobe,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      sourceFile,
    ],
    { timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 },
  );

  const probe = readProbe(probed.stdout);
  const passThrough = canPassThrough(probe);
  const rungs = passThrough ? [] : ladderFor(probe.height);

  const outDir = join(workDir, 'hls');
  // ffmpeg writes segments into `%v` subdirectories but will not create them,
  // and the errno it fails with says nothing about ladders.
  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < Math.max(1, rungs.length); i += 1) {
    await mkdir(join(outDir, String(i)), { recursive: true });
  }
  // A copied file gets a second, small rung (see `LOW_RUNG`).
  const wantsLowRung = tools.lowRung && passThrough && probe.height > LOW_RUNG.height;

  /*
   * The key goes in `workDir`, NEVER in `outDir`: everything under `outDir`
   * is uploaded to the public bucket as it stands, and a key file sitting
   * beside the segments it protects would make the encryption decoration.
   */
  let keyInfoFile: string | null = null;
  if (encryption !== null) {
    const keyFile = join(workDir, 'video.key');
    keyInfoFile = join(workDir, 'video.keyinfo');
    await writeFile(keyFile, encryption.key, { mode: 0o600 });
    await writeFile(keyInfoFile, `${encryption.uri}\n${keyFile}\n`, { mode: 0o600 });
  }

  onStage?.('encoding');
  const tallest = join(outDir, '0');
  const poll =
    onEncodeProgress === undefined
      ? null
      : setInterval(() => {
          readdir(tallest)
            .then((names) => onEncodeProgress(encodedFraction(names, probe.durationSeconds)))
            .catch(() => undefined);
        }, ENCODE_POLL_MS);
  try {
    await exec(
      tools.ffmpeg,
      passThrough
        ? passthroughArgs(sourceFile, outDir, probe.hasAudio, keyInfoFile)
        : transcodeArgs(sourceFile, rungs, outDir, probe.hasAudio, tools.threads, keyInfoFile),
    );
  } finally {
    if (poll !== null) clearInterval(poll);
  }

  if (wantsLowRung) {
    // Best effort, like the poster: the copy alone already plays, so a failure
    // here costs the weak-connection fallback, never the lecture. The master is
    // only touched once the rung exists, so a half-written one is never listed.
    const lowDir = join(outDir, '1');
    try {
      const boundaries = segmentBoundaries(await readFile(join(tallest, 'index.m3u8'), 'utf8'));
      await mkdir(lowDir, { recursive: true });
      await exec(
        tools.ffmpeg,
        lowRungArgs(sourceFile, lowDir, probe.hasAudio, boundaries, tools.threads, keyInfoFile),
      );
      const masterPath = join(outDir, 'master.m3u8');
      const lowWidth = Math.max(2, Math.round((probe.width * LOW_RUNG.height) / probe.height / 2) * 2);
      await writeFile(
        masterPath,
        withLowRung(await readFile(masterPath, 'utf8'), '1/index.m3u8', lowWidth, LOW_RUNG.height),
      );
    } catch {
      await rm(lowDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // The master ffmpeg wrote already plays — it only advertises each rung's
  // ceiling. So a failure here costs a cautious rung choice, never a lecture.
  await measureMasterBandwidth(outDir).catch(() => undefined);

  onStage?.('poster');
  // A poster is a nicety; a lecture that encoded fine must not be failed
  // because one frame would not decode.
  await exec(
    tools.ffmpeg,
    posterArgs(sourceFile, Math.min(60, Math.max(1, probe.durationSeconds * 0.1)), join(outDir, 'poster.jpg')),
  ).catch(() => undefined);

  const files = await listFiles(outDir);
  if (!files.includes('master.m3u8')) {
    throw new Error('ffmpeg خلص من غير ما يكتب master.m3u8');
  }

  let bytes = 0;
  for (const file of files) bytes += (await stat(join(outDir, file))).size;

  return {
    dir: outDir,
    files,
    // `ladderFor` returns tallest-first; a copied file is its own only rung.
    maxHeight: passThrough ? probe.height : rungs[0]!.height,
    bytes,
    durationSeconds: probe.durationSeconds,
    cleanup: async () => {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
