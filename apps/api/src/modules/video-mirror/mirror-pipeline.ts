import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { MIRROR_HEIGHTS, YOUTUBE_ID_RE, type MirrorHeight } from '@ayman/contracts/video';

const run = promisify(execFile);

/**
 * ══════════════════════════════════════════════════════════════════════════
 * Making our copy of a YouTube video.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The whole pipeline is a remux. YouTube already publishes each video as
 * several separate H.264 streams — 1080p, 720p, 480p, 360p, video-only — plus
 * an AAC audio stream. We take those files as they are and repackage them
 * into an HLS ladder with `-c copy`.
 *
 * That single decision is what makes this feature affordable and honest:
 *
 *   * **Quality.** There is no second encode, so a student watching our 720p
 *     is receiving the exact bytes YouTube would have sent for its 720p. The
 *     question «هيبقى وحش؟» has an arithmetic answer rather than a judgement.
 *   * **Cost.** Packaging an hour of video is a copy, not a transcode:
 *     seconds of CPU on the same small VPS that serves the site, instead of
 *     the hour-per-hour a real encode would take and the queue it would build.
 *
 * 1080p is the ceiling because it is the tallest H.264 YouTube publishes.
 * Above it they serve VP9 and AV1 only, which iOS Safari will not play inside
 * HLS — reaching for 1440p would mean a genuine transcode AND a codec a large
 * share of Egyptian phones cannot decode.
 *
 * ── On shelling out ───────────────────────────────────────────────────────
 * Every call here is `execFile` with an ARGUMENT ARRAY. No shell, ever, and
 * no string interpolation into a command. The only externally-influenced
 * value that reaches these processes is the YouTube id, which is re-checked
 * against `YOUTUBE_ID_RE` at the top of `mirrorVideo` even though the
 * database has its own CHECK — the cost of asserting it again is nothing, and
 * it is the value that would otherwise be a command injection if any of the
 * three layers between here and the admin form were ever loosened.
 */

/** yt-dlp's `--dump-single-json` format entry, narrowed to what we read. */
export interface YtFormat {
  format_id: string;
  vcodec?: string | null;
  acodec?: string | null;
  height?: number | null;
  ext?: string | null;
  tbr?: number | null;
}

export interface Rendition {
  readonly height: MirrorHeight;
  readonly formatId: string;
}

export interface Chosen {
  readonly video: readonly Rendition[];
  readonly audioFormatId: string;
}

const isVideoOnly = (f: YtFormat): boolean =>
  typeof f.vcodec === 'string' && f.vcodec.startsWith('avc1') && (!f.acodec || f.acodec === 'none');

const isAudioOnly = (f: YtFormat): boolean =>
  (!f.vcodec || f.vcodec === 'none') && typeof f.acodec === 'string' && f.acodec.startsWith('mp4a');

/**
 * Pick one H.264 stream per ladder rung, plus the best AAC track.
 *
 * EXACT height matches only. Taking "the best format at or below 720p" reads
 * as more forgiving and produces a ladder that lies: a 480p source would be
 * listed three times, once as 480p and twice as smaller rungs pointing at the
 * same bytes, and the player would burn a bandwidth probe switching between
 * identical streams. A video YouTube only has at 480p should be a one-rung
 * ladder that says 480p.
 *
 * Returns `null` when there is no usable H.264 at all — a live stream, or one
 * of the newer uploads YouTube publishes as VP9/AV1 only. That is a real
 * outcome, recorded as a failed mirror with a readable reason, not an
 * exception.
 */
export function chooseRenditions(formats: readonly YtFormat[]): Chosen | null {
  const video: Rendition[] = [];

  for (const height of MIRROR_HEIGHTS) {
    const candidates = formats.filter((f) => isVideoOnly(f) && f.height === height);
    if (candidates.length === 0) continue;
    // Highest bitrate wins: YouTube sometimes publishes two encodes of the
    // same rung and the fatter one is the better picture.
    const best = candidates.reduce((a, b) => ((b.tbr ?? 0) > (a.tbr ?? 0) ? b : a));
    video.push({ height, formatId: best.format_id });
  }

  if (video.length === 0) return null;

  const audio = formats.filter(isAudioOnly);
  if (audio.length === 0) return null;
  const bestAudio = audio.reduce((a, b) => ((b.tbr ?? 0) > (a.tbr ?? 0) ? b : a));

  return { video, audioFormatId: bestAudio.format_id };
}

/**
 * The ffmpeg invocation that turns N downloaded files into an HLS ladder.
 *
 * Built as a pure function so the mapping — the part that is easy to get
 * subtly wrong and impossible to notice, because a mis-mapped ladder still
 * produces a playable master playlist — is asserted in a spec rather than
 * discovered by a student.
 *
 * Each variant needs its OWN `-map` of the audio stream. Referencing `a:0`
 * from three variants without mapping it three times is accepted by the CLI
 * and produces a master playlist whose second and third rungs are silent.
 */
export function hlsArgs(videoFiles: readonly string[], audioFile: string, outDir: string): string[] {
  const inputs = videoFiles.flatMap((file) => ['-i', file]);
  const audioIndex = videoFiles.length;

  const maps = videoFiles.flatMap((_, i) => ['-map', `${i}:v:0`, '-map', `${audioIndex}:a:0`]);

  const varStreamMap = videoFiles.map((_, i) => `v:${i},a:${i}`).join(' ');

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputs,
    '-i',
    audioFile,
    ...maps,
    '-c',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    '6',
    '-hls_playlist_type',
    'vod',
    // fMP4 rather than MPEG-TS: the segments are then the same boxes as the
    // source mp4, so `-c copy` really is a copy, and every browser released
    // this decade plays them.
    '-hls_segment_type',
    'fmp4',
    // Each segment independently decodable, which is what lets the player
    // switch rungs mid-lesson without a visible stall.
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

export interface MirrorResult {
  /** Local directory holding `master.m3u8` and the per-variant folders. */
  readonly dir: string;
  /** Relative paths under `dir`, ready to be keyed under the object prefix. */
  readonly files: readonly string[];
  readonly maxHeight: MirrorHeight;
  readonly bytes: number;
  /** Call when the upload is done — removes the temp directory. */
  readonly cleanup: () => Promise<void>;
}

export interface MirrorTools {
  /** Absolute path or bare name; `yt-dlp` and `ffmpeg` by default. */
  readonly ytDlp: string;
  readonly ffmpeg: string;
  /** Hard ceiling on one video, so a pathological input cannot wedge the queue. */
  readonly timeoutMs: number;
}

export const DEFAULT_TOOLS: MirrorTools = {
  ytDlp: 'yt-dlp',
  ffmpeg: 'ffmpeg',
  timeoutMs: 30 * 60_000,
};

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

/**
 * Download and package one video. Throws with a message fit to store in
 * `mirror_error` and show to an admin — every failure here ends up on a
 * screen, so none of them may be a stack trace.
 */
export async function mirrorVideo(
  youtubeId: string,
  tools: MirrorTools = DEFAULT_TOOLS,
): Promise<MirrorResult> {
  if (!YOUTUBE_ID_RE.test(youtubeId)) {
    throw new Error('mirrorVideo requires an 11-character YouTube id');
  }

  const dir = await mkdtemp(join(tmpdir(), `mirror-${youtubeId}-`));
  const cleanup = async (): Promise<void> => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;

    const probe = await run(
      tools.ytDlp,
      ['--dump-single-json', '--no-playlist', '--no-warnings', url],
      { timeout: tools.timeoutMs, maxBuffer: 64 * 1024 * 1024 },
    );

    const meta = JSON.parse(probe.stdout) as { formats?: YtFormat[]; is_live?: boolean };
    if (meta.is_live === true) throw new Error('الفيديو بث مباشر — مش هينفع ننسخه');

    const chosen = chooseRenditions(meta.formats ?? []);
    if (chosen === null) {
      throw new Error('يوتيوب مش بيوفّر نسخة H.264 للفيديو ده — مش هينفع ننسخه من غير إعادة ضغط');
    }

    const videoFiles: string[] = [];
    for (const rendition of chosen.video) {
      const file = join(dir, `v${rendition.height}.mp4`);
      await run(
        tools.ytDlp,
        ['-f', rendition.formatId, '--no-playlist', '--no-warnings', '-o', file, url],
        { timeout: tools.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      );
      videoFiles.push(file);
    }

    const audioFile = join(dir, 'audio.m4a');
    await run(
      tools.ytDlp,
      ['-f', chosen.audioFormatId, '--no-playlist', '--no-warnings', '-o', audioFile, url],
      { timeout: tools.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
    );

    const outDir = join(dir, 'hls');
    // ffmpeg writes segments into `%v` subdirectories but will not create
    // them. A missing directory here fails the whole run with an errno that
    // says nothing about ladders.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(outDir, { recursive: true });
    for (let i = 0; i < videoFiles.length; i += 1) {
      await mkdir(join(outDir, String(i)), { recursive: true });
    }

    await run(tools.ffmpeg, hlsArgs(videoFiles, audioFile, outDir), {
      timeout: tools.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });

    const files = await listFiles(outDir);
    if (!files.includes('master.m3u8')) {
      throw new Error('ffmpeg خلص من غير ما يكتب master.m3u8');
    }

    let bytes = 0;
    for (const file of files) bytes += (await stat(join(outDir, file))).size;

    return {
      dir: outDir,
      files,
      // `MIRROR_HEIGHTS` is tallest-first and `chooseRenditions` preserves it.
      maxHeight: chosen.video[0]!.height,
      bytes,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
