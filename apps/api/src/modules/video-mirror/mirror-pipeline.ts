import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { MIRROR_MAX_PIXELS, MIRROR_MAX_RUNGS, YOUTUBE_ID_RE } from '@ayman/contracts/video';

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
  /** Read together with `height` — the ceiling is an area, not a height. */
  width?: number | null;
  ext?: string | null;
  tbr?: number | null;
}

export interface Rendition {
  readonly height: number;
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
 * Take YouTube's OWN ladder, capped at the pixel budget, plus the best AAC
 * track.
 *
 * The rungs are whatever YouTube published — not a list of heights we hoped
 * for. That is the correction to the first version of this function, which
 * matched `height === 1080 | 720 | 480 | 360` and looked completely right
 * against a 16:9 fixture.
 *
 * It is wrong for real lectures. YouTube encodes to bitrate TIERS and fits the
 * source's aspect ratio inside each one, so a lecture shot at 2:1 — a slide
 * deck with a camera inset, which is most of them — has its "480p" rung
 * published as 854×394. Exact-height matching found nothing, and the video
 * would have been recorded as «يوتيوب مش بيوفّر نسخة H.264» while its H.264
 * sat right there in the format list. Measured against a real
 * ثانوية-عامة physics lecture, which is how it was caught.
 *
 * Deduplicating by height keeps the "no invented rungs" property that mattered
 * in the first version: a source YouTube only has at one tier becomes a
 * one-rung ladder, not the same bytes listed three times for a player to waste
 * bandwidth probing between.
 *
 * Returns `null` when there is no usable H.264 at all — a live stream, or one
 * of the newer uploads YouTube publishes as VP9/AV1 only. That is a real
 * outcome, recorded as a failed mirror with a readable reason, not an
 * exception.
 */
export function chooseRenditions(
  formats: readonly YtFormat[],
  maxPixels: number = MIRROR_MAX_PIXELS,
): Chosen | null {
  const usable = formats.filter(
    (f) =>
      isVideoOnly(f) &&
      typeof f.height === 'number' &&
      f.height > 0 &&
      // `width` is missing on some entries; the height alone still bounds
      // those, and no YouTube rung is wider than it is tall by more than the
      // budget allows.
      (f.width ?? 0) * f.height <= maxPixels,
  );

  // One format per rung, the fattest — YouTube sometimes publishes two encodes
  // of the same tier and the bigger one is the better picture.
  const best = new Map<number, YtFormat>();
  for (const format of usable) {
    const height = format.height as number;
    const incumbent = best.get(height);
    if (incumbent === undefined || (format.tbr ?? 0) > (incumbent.tbr ?? 0)) {
      best.set(height, format);
    }
  }

  const video = [...best.values()]
    .sort((a, b) => (b.height as number) - (a.height as number))
    .slice(0, MIRROR_MAX_RUNGS)
    .map((f) => ({ height: f.height as number, formatId: f.format_id }));

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
  readonly maxHeight: number;
  readonly bytes: number;
  /** Call when the upload is done — removes the temp directory. */
  readonly cleanup: () => Promise<void>;
}

/**
 * ── Which Innertube client we ask, and why there is a list ─────────────────
 *
 * yt-dlp's default clients are the web ones, and from a data-centre IP
 * YouTube answers those with «Sign in to confirm you're not a bot» — for
 * every video, on the very first metadata call. That is not a bug we can fix
 * in our code and not something a retry outlasts: it is the address we are
 * calling from. This platform's server is exactly such an address, so the
 * default path mirrors nothing at all.
 *
 * What still answers is the clients built for devices that have no browser
 * and run no JavaScript, so YouTube cannot put an attestation challenge in
 * front of them. We ask those, in order, and take the first that replies.
 *
 * The ORDER is about quality, not just success. Only `visionos` returns the
 * whole H.264 ladder; `android_vr`, `tv_simply` and `mweb` reply happily and
 * offer 360p and nothing else. Putting any of them first would «work» — and
 * quietly mirror every lecture on the platform at 360p forever. `default`
 * stays last so that a machine YouTube does not mind (a laptop, CI, a future
 * host on a residential range) still gets the ordinary path.
 */
export const YT_CLIENTS = ['visionos', 'android_vr', 'tv_simply', 'mweb', 'default'] as const;

/** The flag pair for one client. `default` means "pass nothing". */
export function clientArgs(client: string): string[] {
  return client === 'default' ? [] : ['--extractor-args', `youtube:player_client=${client}`];
}

/** yt-dlp's own one-line reason, for an error an admin has to read. */
function refusal(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr ?? '';
  const line = stderr
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('ERROR:'));
  if (line !== undefined) return line.replace(/^ERROR:\s*/, '').slice(0, 200);
  return (error as Error).message.split('\n')[0]!.slice(0, 200);
}

export interface MirrorTools {
  /** Absolute path or bare name; `yt-dlp` and `ffmpeg` by default. */
  readonly ytDlp: string;
  readonly ffmpeg: string;
  /** Hard ceiling on one video, so a pathological input cannot wedge the queue. */
  readonly timeoutMs: number;
  /** Innertube clients to try, in order. See `YT_CLIENTS`. */
  readonly clients: readonly string[];
  /**
   * Lower the ceiling for one run. Optional, and the default is the platform
   * ceiling — a backfill run from a laptop may deliberately stop at 720p,
   * where the top rung is over half the bytes and nobody watching a lecture
   * on a ministry tablet can tell the difference.
   */
  readonly maxPixels?: number;
  /** Seam for the specs — production always runs the real `execFile`. */
  readonly exec: typeof run;
}

export const DEFAULT_TOOLS: MirrorTools = {
  ytDlp: 'yt-dlp',
  ffmpeg: 'ffmpeg',
  timeoutMs: 30 * 60_000,
  clients: YT_CLIENTS,
  exec: run,
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
 * Is what the bucket holds a ladder we can serve, and how tall is it?
 *
 * Split out from the listing so the judgement can be tested without an S3
 * client — the judgement is the part with a real failure mode. Returns the
 * tallest rung's height, or `null` when the prefix is not a complete ladder.
 *
 * ⚠️ «Some objects exist» is NOT the test. An upload interrupted halfway
 * leaves hundreds of segments behind, and treating that as a mirror marks a
 * lecture `ready` whose player stalls partway through — with no failure
 * recorded anywhere, because as far as the platform is concerned it worked.
 * So every variant playlist the master names has to actually be there.
 */
export function adoptableLadder(
  prefix: string,
  master: string,
  keys: ReadonlySet<string>,
): number | null {
  const heights = [...master.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1]));
  const variants = master
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (heights.length === 0 || variants.length === 0) return null;
  if (variants.some((variant) => !keys.has(`${prefix}/${variant}`))) return null;

  return Math.max(...heights);
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

    /*
     * Ask each client until one answers with a ladder.
     *
     * A client that is refused and a client that answers with 360p and
     * nothing else are the same outcome here — keep going — because both
     * leave a lecture worse off than the next candidate would. Only a reply
     * we can actually build a ladder from ends the loop, and the client that
     * gave it is the client every later download must use: format ids are
     * per-client, and asking `visionos` for a format id `mweb` invented gets
     * «Requested format is not available».
     */
    let chosen: Chosen | null = null;
    let client = '';
    const refusals: string[] = [];

    for (const candidate of tools.clients) {
      let stdout: string;
      try {
        const probe = await tools.exec(
          tools.ytDlp,
          ['--dump-single-json', '--no-playlist', '--no-warnings', ...clientArgs(candidate), url],
          { timeout: tools.timeoutMs, maxBuffer: 64 * 1024 * 1024 },
        );
        stdout = probe.stdout;
      } catch (error) {
        refusals.push(`${candidate}: ${refusal(error)}`);
        continue;
      }

      const meta = JSON.parse(stdout) as { formats?: YtFormat[]; is_live?: boolean };
      // A live stream is a property of the VIDEO, not of the client we asked,
      // so no other client would answer differently. Stop rather than ask
      // four more times and report the last one's refusal instead.
      if (meta.is_live === true) throw new Error('الفيديو بث مباشر — مش هينفع ننسخه');

      const ladder = chooseRenditions(meta.formats ?? [], tools.maxPixels);
      if (ladder === null) {
        refusals.push(`${candidate}: مفيش H.264`);
        continue;
      }

      chosen = ladder;
      client = candidate;
      break;
    }

    if (chosen === null) {
      throw new Error(
        `مفيش عميل من يوتيوب رضي يدّي الفيديو ده نسخة H.264 — ${refusals.join(' · ')}`,
      );
    }

    const videoFiles: string[] = [];
    for (const rendition of chosen.video) {
      const file = join(dir, `v${rendition.height}.mp4`);
      await tools.exec(
        tools.ytDlp,
        [
          '-f',
          rendition.formatId,
          '--no-playlist',
          '--no-warnings',
          ...clientArgs(client),
          '-o',
          file,
          url,
        ],
        { timeout: tools.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      );
      videoFiles.push(file);
    }

    const audioFile = join(dir, 'audio.m4a');
    await tools.exec(
      tools.ytDlp,
      [
        '-f',
        chosen.audioFormatId,
        '--no-playlist',
        '--no-warnings',
        ...clientArgs(client),
        '-o',
        audioFile,
        url,
      ],
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

    await tools.exec(tools.ffmpeg, hlsArgs(videoFiles, audioFile, outDir), {
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
      // `chooseRenditions` returns the ladder tallest-first.
      maxHeight: chosen.video[0]!.height,
      bytes,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
