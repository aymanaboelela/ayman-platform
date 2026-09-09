import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { ladderFor, type LadderRung } from '@ayman/contracts/video';
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
 * `-preset veryfast` is deliberate and is not a compromise on the picture. At
 * a fixed bitrate a slower preset buys perhaps 10% efficiency for 4× the CPU,
 * and the content here — slides, code on screen, a talking head — is the kind
 * x264 already handles well. The bitrate ladder is where the quality decision
 * actually lives, and it is in `@ayman/contracts/video` where it can be read.
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
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  /** Present on phone recordings; ffmpeg applies it, so the DISPLAY size swaps. */
  side_data_list?: { rotation?: number }[];
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
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

  return {
    width: quarterTurned ? video.height : video.width,
    height: quarterTurned ? video.width : video.height,
    durationSeconds: Math.round(duration),
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
  };
}

/** Segment length. Matches the mirror's, so both ladders behave identically. */
const SEGMENT_SECONDS = 6;

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
): string[] {
  const n = rungs.length;

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
    `-b:v:${i}`,
    `${rung.videoKbps}k`,
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
    'veryfast',
    // `high` — universally decodable on hardware since roughly 2010, and the
    // profile every phone in an Egyptian classroom accelerates.
    '-profile:v',
    'high',
    // Sources that are 10-bit or 4:2:2 (a decent camera) decode to a pixel
    // format most phones cannot play back. Pinning it here is what stops a
    // lecture encoding perfectly and being a black screen on half the class.
    '-pix_fmt',
    'yuv420p',
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
    'fmp4',
    '-hls_flags',
    'independent_segments',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    varStreamMap,
    '-hls_segment_filename',
    join(outDir, '%v', 'seg_%03d.m4s'),
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
   * Encoder threads. `0` lets ffmpeg use every core, which on a shared VPS
   * means the site gets slow for the length of a lecture. Configurable so a
   * bigger machine can be told to go faster.
   */
  readonly threads: number;
  /**
   * Prefix the encoder with `nice -n 19`. Scheduling priority, not a core
   * limit: ffmpeg still finishes as fast as the idle capacity allows, and
   * yields the instant a student's request needs the CPU.
   */
  readonly renice: boolean;
}

export const DEFAULT_TRANSCODE_TOOLS: TranscodeTools = {
  // Spread rather than restate: `TranscodeTools` extends `MirrorTools`, and a
  // second literal of the same fields is a second place to forget one.
  ...DEFAULT_TOOLS,
  ffprobe: 'ffprobe',
  // An encode is far slower than a remux; a two-hour lecture at four rungs
  // legitimately runs past the mirror's half hour.
  timeoutMs: 6 * 60 * 60_000,
  threads: 0,
  renice: process.platform === 'linux',
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
  const rungs = ladderFor(probe.height);

  const outDir = join(workDir, 'hls');
  // ffmpeg writes segments into `%v` subdirectories but will not create them,
  // and the errno it fails with says nothing about ladders.
  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < rungs.length; i += 1) {
    await mkdir(join(outDir, String(i)), { recursive: true });
  }

  onStage?.('encoding');
  await exec(
    tools.ffmpeg,
    transcodeArgs(sourceFile, rungs, outDir, probe.hasAudio, tools.threads),
  );

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
    // `ladderFor` returns tallest-first.
    maxHeight: rungs[0]!.height,
    bytes,
    durationSeconds: probe.durationSeconds,
    cleanup: async () => {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
