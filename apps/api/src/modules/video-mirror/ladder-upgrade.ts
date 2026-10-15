import { execFile, spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { UPLOAD_LADDER, type LadderRung } from '@ayman/contracts/video';
import type { MirrorStorage } from './mirror-storage';
import {
  readMasterVariants,
  readMediaPlaylist,
  variantBandwidth,
  withMeasuredBandwidth,
  withRung,
  type VariantBandwidth,
} from './upload-pipeline';

const run = promisify(execFile);

/**
 * ── «حسّن الجودات» ────────────────────────────────────────────────────────
 *
 * A lecture published as it is (a file the owner exported himself) has ONE
 * rung, and a student on a weak line has nothing to fall to. The owner asked
 * to build the rest on his own schedule — at night, by pressing a button —
 * rather than have the shared VPS encode when he uploads.
 *
 * The original file is gone by then (deleted once the ladder was ready), but
 * the tallest rung IS the original's picture, copied bit for bit. So the
 * worker takes that rung back out of the bucket, decrypts it with the
 * lecture's own key, and encodes the shorter rungs from it. Quality of the
 * 1080 is untouched: nothing here rewrites it.
 *
 * ⚠️ Every new rung is cut at EXACTLY the tallest rung's segment boundaries
 * (`segmentBoundaries`) — the same reason the 360 beside a copied file was.
 * A rung on its own grid stalls the player at every switch. After encoding, the
 * segment count of each rung must equal the source rung's, or nothing is
 * uploaded.
 */
export const UPGRADE_RUNGS: readonly LadderRung[] = UPLOAD_LADDER;

/**
 * ONE core. The first real run (lecture 5, 2026-10-11) used two, and on a
 * busy afternoon that put the shared 4-core box straight onto the pause line:
 * two minutes of encoding, two minutes stopped, over and over. One core keeps
 * the load under the line, so the encode runs steadily — at about the same
 * pace, and without ever leaning on the students' sites.
 */
export const UPGRADE_THREADS = 1;

/**
 * `faster`, not the upload ladder's `medium`. Measured on lecture 5 itself
 * (three minutes, 720p, CRF 23, one thread):
 *
 *   medium    98 s CPU   1183 kbit/s   VMAF 96.2
 *   faster    65 s CPU   1099 kbit/s   VMAF 95.5
 *   veryfast  49 s CPU    962 kbit/s   VMAF 93.7
 *
 * A third less CPU and a SMALLER file, for 0.6 VMAF no one can see. These are
 * the fallback rungs a weak connection drops to; veryfast's 93.7 starts to
 * soften the code on the slides.
 */
export const UPGRADE_PRESET = 'faster' as const;

/** `RESOLUTION=WxH` of each variant of a master, in the order the master lists them. */
export function variantSizes(master: string): Array<{ uri: string; width: number; height: number }> {
  const out: Array<{ uri: string; width: number; height: number }> = [];
  const lines = master.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]!.startsWith('#EXT-X-STREAM-INF:')) continue;
    const match = /RESOLUTION=(\d+)x(\d+)/.exec(lines[i]!);
    const uri = readMasterVariants(lines.slice(i).join('\n'))[0];
    if (match && uri) out.push({ uri, width: Number(match[1]), height: Number(match[2]) });
  }
  return out;
}

/** What a media playlist says about decrypting and unpacking its segments. */
export function readSegmentEncoding(playlist: string): {
  encrypted: boolean;
  /** Explicit `IV=`, or `null` for «the segment's sequence number». */
  iv: Buffer | null;
  /** fMP4 init segment, when there is one. */
  init: string | null;
} {
  const key = /#EXT-X-KEY:([^\n]*)/.exec(playlist)?.[1] ?? '';
  const encrypted = /METHOD=AES-128/.test(key);
  const ivHex = /IV=0x([0-9a-fA-F]{32})/.exec(key)?.[1];
  const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist)?.[1] ?? null;
  return { encrypted, iv: ivHex ? Buffer.from(ivHex, 'hex') : null, init };
}

/** HLS's implicit IV: the segment's media sequence number, big-endian, 16 bytes. */
export function sequenceIv(sequence: number): Buffer {
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(sequence >>> 0, 12);
  return iv;
}

/**
 * Rungs still worth building: shorter than the source, not already there —
 * and, when the owner named some (`requested`), only those. Empty = «الكل».
 */
export function rungsToBuild(
  existingHeights: readonly number[],
  sourceHeight: number,
  requested: readonly number[] = [],
): LadderRung[] {
  return UPGRADE_RUNGS.filter(
    (rung) =>
      rung.height < sourceHeight &&
      !existingHeights.includes(rung.height) &&
      (requested.length === 0 || requested.includes(rung.height)),
  );
}

/**
 * ── Not at the students' expense ─────────────────────────────────────────
 *
 * The three stacks share one 4-core VPS, and on 2026-10-04 one encode at full
 * tilt was enough for Hostinger to cap the CPU and take all three sites down.
 * `nice` and two threads make this polite; they do not make it SAFE, because
 * the box can be busy for reasons that are not ours (a student rush, another
 * stack's own encode). So the encoder watches the machine and gets out of the
 * way: when the load climbs it is STOPPED (`SIGSTOP`) — not slowed, stopped,
 * the CPU it was using is free that instant — and continued (`SIGCONT`) when
 * the box has calmed down.
 *
 * Two thresholds, and the gap is the point. The 1-minute load average counts
 * our own threads, so resuming at the level we paused at would put the load
 * straight back over the line and pause us again every half minute. We resume
 * only when the load, WITH our threads added back, would still be under the
 * line that paused us.
 */
export interface ThrottleLimits {
  /** Pause above this 1-minute load average. */
  readonly pauseAbove: number;
  /** Resume below this. Always under `pauseAbove` by at least the encoder's own threads. */
  readonly resumeBelow: number;
  /** A pause shorter than this tells nothing: the load average lags what it measures. */
  readonly minPauseMs: number;
}

/** Limits for a box with `cores` cores and an encoder using `threads` of them. */
export function throttleLimits(cores: number, threads: number): ThrottleLimits {
  const pauseAbove = cores * 0.9;
  return {
    pauseAbove,
    resumeBelow: Math.max(0.3, pauseAbove - threads - 0.5),
    minPauseMs: 30_000,
  };
}

/** What to do about the encoder right now. Pure — the timing lives in the caller. */
export function throttleDecision(
  load: number,
  paused: boolean,
  pausedForMs: number,
  limits: ThrottleLimits,
): 'pause' | 'resume' | 'keep' {
  if (!paused) return load > limits.pauseAbove ? 'pause' : 'keep';
  return load < limits.resumeBelow && pausedForMs >= limits.minPauseMs ? 'resume' : 'keep';
}

export interface Throttle {
  readonly limits: ThrottleLimits;
  /** The 1-minute load average. */
  readonly load: () => number;
  readonly pollMs: number;
  /** `true` when the encoder was stopped for the machine's sake, `false` when it was let go again. */
  readonly onWaiting: (waiting: boolean) => void;
}

/**
 * Run a command under the throttle.
 *
 * `spawn`, not `execFile`: a signal has to reach the process while it runs.
 * With `nice` in front the pid is the encoder's own — `nice` execs it — so one
 * `SIGSTOP` stops the encoder and every thread it started.
 */
export function runThrottled(
  bin: string,
  args: readonly string[],
  throttle: Throttle,
  options: { renice: boolean; timeoutMs: number },
): Promise<void> {
  const child = options.renice
    ? spawn('nice', ['-n', '19', bin, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    : spawn(bin, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    // The tail is the part that says why it died.
    stderr = (stderr + chunk.toString()).slice(-2_000);
  });

  return new Promise<void>((resolve, reject) => {
    let paused = false;
    let pausedAt = 0;
    let finished = false;

    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearInterval(watch);
      clearTimeout(deadline);
      // A stopped process cannot hear SIGTERM: continue it first, or it
      // outlives us holding its memory — and the next worker's CPU.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGCONT');
        if (error) child.kill('SIGKILL');
      }
      if (paused) throttle.onWaiting(false);
      if (error) reject(error);
      else resolve();
    };

    const watch = setInterval(() => {
      if (finished) return;
      const decision = throttleDecision(throttle.load(), paused, Date.now() - pausedAt, throttle.limits);
      if (decision === 'pause') {
        child.kill('SIGSTOP');
        paused = true;
        pausedAt = Date.now();
        throttle.onWaiting(true);
      } else if (decision === 'resume') {
        child.kill('SIGCONT');
        paused = false;
        throttle.onWaiting(false);
      }
    }, throttle.pollMs);

    const deadline = setTimeout(() => finish(new Error('الترميز خد وقت أطول من المسموح')), options.timeoutMs);

    child.on('error', (error) => finish(error));
    child.on('close', (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(`ffmpeg وقف (${code ?? signal}): ${stderr.trim().slice(-300)}`));
    });
  });
}

/** Wait, before starting something heavy, until the box is under the resume line. */
export async function waitUntilCalm(throttle: Throttle, isAborted: () => boolean = () => false): Promise<void> {
  let waiting = false;
  while (throttle.load() > throttle.limits.resumeBelow + 0.5 && !isAborted()) {
    if (!waiting) {
      waiting = true;
      throttle.onWaiting(true);
    }
    await new Promise((resolve) => setTimeout(resolve, throttle.pollMs));
  }
  if (waiting) throttle.onWaiting(false);
}

/** The throttle the worker uses: this machine's load, this encoder's threads. */
export function machineThrottle(threads: number, onWaiting: (waiting: boolean) => void): Throttle {
  return {
    limits: throttleLimits(cpus().length, threads),
    load: () => loadavg()[0] ?? 0,
    pollMs: 5_000,
    onWaiting,
  };
}

export interface UpgradeDeps {
  readonly storage: MirrorStorage;
  /** `v/<id>` */
  readonly prefix: string;
  /** The lecture's AES key, or `null` for one published unencrypted. */
  readonly key: Buffer | null;
  /** Where players fetch the key from — written into the new playlists. */
  readonly keyUri: string;
  readonly work: string;
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly threads: number;
  readonly renice: boolean;
  readonly onProgress: (percent: number) => void;
  /** What the machine can take — see `Throttle`. */
  readonly throttle: Throttle;
  /** Kept for the caller's sake; nothing large is written to disk any more. */
  readonly expectedBytes?: number;
  /** Only these heights. Empty or absent = every missing rung. */
  readonly heights?: readonly number[];
  /** How often progress is saved — `CHECKPOINT_EVERY` unless a test needs it smaller. */
  readonly checkpointEvery?: number;
}

export interface UpgradeResult {
  /** Every height the lecture offers now, tallest first. */
  readonly heights: number[];
  /** Bytes ADDED to the bucket. */
  readonly addedBytes: number;
  /** Nothing was missing — no rung built, master untouched. */
  readonly nothingToDo: boolean;
  /** Rungs an earlier, interrupted attempt had already finished — taken, not rebuilt. */
  readonly reused: number[];
}

/**
 * ── One segment at a time ─────────────────────────────────────────────────
 *
 * The first version decrypted the whole tallest rung into one file and ran one
 * encode per new rung over it — and a deploy restarts the API container, which
 * kills the encode. On 2026-10-11 other sessions merged every half hour while
 * lecture 5's 720p (over an hour of encoding) was running: it reached 35% and
 * started again from nothing, three times. Saving a rung only once it was
 * complete could not help: no rung lived long enough to complete.
 *
 * So the unit of work is now ONE SEGMENT. For each of the tallest rung's
 * segments: download it, decrypt it, encode it into every missing rung in one
 * ffmpeg run, encrypt the results, upload them. Every `CHECKPOINT_EVERY`
 * segments the progress goes to the bucket; an interrupted attempt resumes at
 * the last checkpoint and loses a minute, not an hour.
 *
 * And it is exactly right by construction, not by arithmetic:
 *
 *   · each new segment is made from the SAME frames as the segment it sits
 *     beside, so the rungs cut at identical instants with nothing to force;
 *   · `-copyts` and a zero mux delay keep the original timestamps, so every
 *     rung is on the one timeline the player switches across;
 *   · the audio is COPIED, not re-encoded — re-encoding six seconds at a time
 *     would put an AAC priming gap («تكة») at every segment boundary, and a
 *     copy is the same sound on every rung, which is what makes a switch
 *     inaudible. The price is the source's audio rate on the light rungs
 *     (131 kbit/s on lecture 5) — small next to their video.
 *
 * Nothing the size of the lecture is ever on the disk: one segment in, a few
 * out, and they are gone before the next.
 */
export const CHECKPOINT_EVERY = 20;

/** HLS's IV for every segment we encrypt — what ffmpeg wrote for the copied rung, and what its playlist line says. */
const ZERO_IV = Buffer.alloc(16);

/** One rung's progress through an attempt, saved in the bucket every `CHECKPOINT_EVERY` segments. */
export interface RungProgress {
  readonly height: number;
  readonly segments: number;
  /** Segments `0 … done-1` are in the bucket. */
  readonly done: number;
  /** Encrypted size of each segment uploaded so far — the master's bandwidth comes from these. */
  readonly sizes: number[];
}

/** A saved progress that still applies: same rung, same cut, and sizes for everything it claims. */
export function usableProgress(text: string | null, height: number, segments: number): RungProgress | null {
  if (text === null) return null;
  try {
    const progress = JSON.parse(text) as Partial<RungProgress>;
    if (progress.height !== height || progress.segments !== segments) return null;
    if (typeof progress.done !== 'number' || !Array.isArray(progress.sizes)) return null;
    if (progress.done < 0 || progress.done > segments || progress.sizes.length < progress.done) return null;
    return { height, segments, done: progress.done, sizes: progress.sizes.slice(0, progress.done) };
  } catch {
    return null;
  }
}

/**
 * The ffmpeg run for ONE segment: every pending rung from one decode.
 * Pure, so the flags that make the rungs line up are asserted in a spec.
 */
export function segmentArgs(
  input: string,
  outputs: ReadonlyArray<{ file: string; rung: LadderRung }>,
  threads: number,
  preset: 'medium' | 'faster' | 'veryfast' = UPGRADE_PRESET,
): string[] {
  const n = outputs.length;
  const split = outputs.map((_, i) => `[s${i}]`).join('');
  const scales = outputs.map((o, i) => `[s${i}]scale=-2:${o.rung.height}:flags=bicubic[v${i}]`).join(';');
  const filter = n === 1 ? `[0:v]scale=-2:${outputs[0]!.rung.height}:flags=bicubic[v0]` : `[0:v]split=${n}${split};${scales}`;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    // The copied rung's own timestamps, untouched: one timeline for every rung.
    '-copyts',
    '-i',
    input,
    '-filter_complex',
    filter,
    ...outputs.flatMap((o, i) => [
      '-map',
      `[v${i}]`,
      // Optional: a lecture recorded without sound still has a picture.
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '23',
      '-maxrate',
      `${o.rung.maxKbps}k`,
      '-bufsize',
      `${o.rung.maxKbps * 2}k`,
      '-threads',
      String(threads),
      // The encoder's clock at 90 kHz, the transport stream's own. Left at the
      // frame rate it rounds every timestamp to the nearest frame, and a source
      // whose frames sit a little off that grid (an export that shifted video
      // by the audio's priming, 23 ms) came out 10 ms late against the copied
      // rung — measured on the server's ffmpeg 5.1; 1:90000 matched exactly
      // there and on 8.1.
      '-enc_time_base:v',
      '1:90000',
      '-c:a',
      'copy',
      // No offset of its own: the copied rung's segments already carry it.
      '-muxdelay',
      '0',
      '-muxpreload',
      '0',
      '-f',
      'mpegts',
      o.file,
    ]),
  ];
}

/** A rung's media playlist: the tallest rung's cuts, our segment names, one key line. */
export function rungPlaylist(
  top: { targetDurationSeconds: number; segments: ReadonlyArray<{ durationSeconds: number }> },
  keyUri: string | null,
): string {
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    `#EXT-X-TARGETDURATION:${Math.max(1, Math.ceil(top.targetDurationSeconds))}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ];
  if (keyUri !== null) lines.push(`#EXT-X-KEY:METHOD=AES-128,URI="${keyUri}",IV=0x${ZERO_IV.toString('hex')}`);
  top.segments.forEach((segment, i) => {
    lines.push(`#EXTINF:${segment.durationSeconds.toFixed(6)},`, segmentName(i));
  });
  lines.push('#EXT-X-ENDLIST', '');
  return lines.join('\n');
}

function segmentName(index: number): string {
  return `seg_${String(index).padStart(3, '0')}.ts`;
}

/**
 * What a finished rung leaves beside its segments: proof that it is complete,
 * and the numbers its master line needs. Written LAST, after every segment and
 * the playlist are in the bucket — so its presence is the claim that all of it
 * arrived.
 */
export interface RungRecord {
  readonly height: number;
  readonly width: number;
  readonly segments: number;
  readonly peak: number;
  readonly average: number;
  readonly bytes: number;
}

/** Where a built rung lives. Named by HEIGHT, not by position: the same rung keeps the same place on every attempt, whatever else was asked for. */
export function rungDir(height: number): string {
  return `r${height}`;
}

/** A finished rung from an earlier attempt, or `null` — missing, partial, or for a different cut. */
export function usableRecord(text: string | null, height: number, segments: number): RungRecord | null {
  if (text === null) return null;
  try {
    const record = JSON.parse(text) as Partial<RungRecord>;
    const ok =
      record.height === height &&
      record.segments === segments &&
      typeof record.width === 'number' &&
      typeof record.peak === 'number' &&
      typeof record.average === 'number' &&
      typeof record.bytes === 'number';
    return ok ? (record as RungRecord) : null;
  } catch {
    return null;
  }
}

/** Build the missing rungs from the tallest one in the bucket, segment by segment, and publish them. */
export async function upgradeLadder(deps: UpgradeDeps): Promise<UpgradeResult> {
  const { storage, prefix, key, work } = deps;
  const master = await storage.readText(`${prefix}/master.m3u8`);
  const variants = variantSizes(master);
  if (variants.length === 0) throw new Error('ملف الجودات مش فيه أي جودة');
  const top = variants.reduce((a, b) => (b.height > a.height ? b : a));
  const todo = rungsToBuild(
    variants.map((v) => v.height),
    top.height,
    deps.heights ?? [],
  );
  const heightsNow = variants.map((v) => v.height).sort((a, b) => b - a);
  if (todo.length === 0) return { heights: heightsNow, addedBytes: 0, nothingToDo: true, reused: [] };

  const topDir = dirname(top.uri);
  const playlistText = await storage.readText(`${prefix}/${top.uri}`);
  const media = readMediaPlaylist(playlistText);
  const total = media.segments.length;
  if (total === 0) throw new Error('الجودة الأساسية مالهاش قطع');
  const encoding = readSegmentEncoding(playlistText);
  if (encoding.encrypted && key === null) throw new Error('الفيديو مشفّر ومفيش مفتاح');
  // New rungs are encrypted whenever the copied one is, with the same key.
  const keyUri = encoding.encrypted ? deps.keyUri : null;

  /* ── 0. what earlier, interrupted attempts already did ─────────────────── */
  const finished = new Map<number, RungRecord>();
  const progress = new Map<number, RungProgress>();
  for (const rung of todo) {
    const dir = `${prefix}/${rungDir(rung.height)}`;
    const record = usableRecord(await storage.readText(`${dir}/rung.json`).catch(() => null), rung.height, total);
    if (record !== null) {
      finished.set(rung.height, record);
      continue;
    }
    const saved = usableProgress(await storage.readText(`${dir}/progress.json`).catch(() => null), rung.height, total);
    progress.set(rung.height, saved ?? { height: rung.height, segments: total, done: 0, sizes: [] });
  }
  const reused = [...finished.keys()];
  const pending = todo.filter((rung) => !finished.has(rung.height));

  if (pending.length > 0) {
    const scratch = join(work, 'seg');
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });
    for (const rung of pending) await mkdir(join(scratch, rungDir(rung.height)), { recursive: true });
    const init = encoding.init ? await downloadBytes(storage, `${prefix}/${topDir}/${encoding.init}`, join(scratch, 'init')) : null;

    const saveProgress = async (rung: LadderRung) => {
      const name = `${rungDir(rung.height)}/progress.json`;
      await writeFile(join(scratch, name), JSON.stringify(progress.get(rung.height)));
      await storage.uploadLadder(scratch, [name], prefix);
    };

    let paused = false;
    let pausedAt = 0;
    const start = Math.min(...pending.map((rung) => progress.get(rung.height)!.done));
    for (let index = start; index < total; index += 1) {
      /*
       * The machine first. Between segments is the natural place to stop: a
       * segment is a second or two of work, so this is as prompt as stopping
       * an encode mid-stream, and nothing is left half-written.
       */
      for (;;) {
        const decision = throttleDecision(deps.throttle.load(), paused, Date.now() - pausedAt, deps.throttle.limits);
        if (decision === 'pause') {
          paused = true;
          pausedAt = Date.now();
          deps.throttle.onWaiting(true);
        } else if (decision === 'resume') {
          paused = false;
          deps.throttle.onWaiting(false);
        }
        if (!paused) break;
        await new Promise((resolve) => setTimeout(resolve, deps.throttle.pollMs));
      }

      const due = pending.filter((rung) => progress.get(rung.height)!.done <= index);
      if (due.length === 0) continue;

      // The tallest rung's segment, decrypted — with the init segment in front for fMP4.
      const raw = await downloadBytes(storage, `${prefix}/${topDir}/${media.segments[index]!.uri}`, join(scratch, 'in.raw'));
      const clear =
        encoding.encrypted
          ? decrypt(raw, key!, encoding.iv ?? sequenceIv(index))
          : raw;
      const input = join(scratch, init ? 'in.mp4' : 'in.ts');
      await writeFile(input, init ? Buffer.concat([init, clear]) : clear);

      const outputs = due.map((rung) => ({ rung, file: join(scratch, rungDir(rung.height), 'out.ts') }));
      const exec = deps.renice ? 'nice' : deps.ffmpeg;
      const args = segmentArgs(input, outputs, deps.threads);
      await run(exec, deps.renice ? ['-n', '19', deps.ffmpeg, ...args] : args, {
        maxBuffer: 16 * 1024 * 1024,
        timeout: 10 * 60_000,
      });

      for (const { rung, file } of outputs) {
        const name = `${rungDir(rung.height)}/${segmentName(index)}`;
        const bytes = await readFile(file);
        const sealed = keyUri !== null ? encrypt(bytes, key!) : bytes;
        await writeFile(join(scratch, name), sealed);
        await storage.uploadLadder(scratch, [name], prefix);
        await rm(join(scratch, name), { force: true });
        const now = progress.get(rung.height)!;
        progress.set(rung.height, { ...now, done: index + 1, sizes: [...now.sizes.slice(0, index), sealed.length] });
        if ((index + 1) % (deps.checkpointEvery ?? CHECKPOINT_EVERY) === 0) await saveProgress(rung);
      }
      if (index % 5 === 0) deps.onProgress(5 + Math.floor((index / total) * 85));
    }

    /* ── 2. close each rung: playlist, then the record that says it is whole ── */
    for (const rung of pending) {
      const now = progress.get(rung.height)!;
      if (now.done !== total || now.sizes.length !== total) {
        throw new Error(`جودة ${rung.height}p ناقصة (${now.done} من ${total}) — مش هتتنشر`);
      }
      const dir = rungDir(rung.height);
      await writeFile(join(scratch, dir, 'index.m3u8'), rungPlaylist(media, keyUri));
      await storage.uploadLadder(scratch, [`${dir}/index.m3u8`], prefix);
      const bandwidth = variantBandwidth(
        media.segments.map((segment, i) => ({ durationSeconds: segment.durationSeconds, bytes: now.sizes[i]! })),
        media.targetDurationSeconds,
      );
      const record: RungRecord = {
        height: rung.height,
        width: Math.max(2, Math.round((top.width * rung.height) / top.height / 2) * 2),
        segments: total,
        peak: bandwidth?.peak ?? rung.maxKbps * 1000,
        average: bandwidth?.average ?? rung.maxKbps * 1000,
        bytes: now.sizes.reduce((sum, size) => sum + size, 0),
      };
      await writeFile(join(scratch, dir, 'rung.json'), JSON.stringify(record));
      await storage.uploadLadder(scratch, [`${dir}/rung.json`], prefix);
      finished.set(rung.height, record);
    }
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }

  /* ── 3. the master, LAST: only now does any student see the new rungs ── */
  let nextMaster = master;
  const measured = new Map<string, VariantBandwidth>();
  let addedBytes = 0;
  for (const rung of todo) {
    const record = finished.get(rung.height)!;
    const uri = `${rungDir(rung.height)}/index.m3u8`;
    nextMaster = withRung(nextMaster, uri, record.width, record.height, rung.maxKbps);
    measured.set(uri, { peak: record.peak, average: record.average });
    addedBytes += record.bytes;
  }
  const masterRoot = join(work, 'master');
  await mkdir(masterRoot, { recursive: true });
  await writeFile(join(masterRoot, 'master.m3u8'), withMeasuredBandwidth(nextMaster, measured));
  deps.onProgress(95);
  await storage.uploadLadder(masterRoot, ['master.m3u8'], prefix);

  return {
    heights: [...heightsNow, ...todo.map((r) => r.height)].sort((a, b) => b - a),
    addedBytes,
    nothingToDo: false,
    reused,
  };
}

async function downloadBytes(storage: MirrorStorage, key: string, file: string): Promise<Buffer> {
  await storage.downloadTo(key, file);
  return readFile(file);
}

function decrypt(bytes: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(bytes), decipher.final()]);
}

/** AES-128-CBC with PKCS#7 padding and the zero IV the playlist names — HLS's own scheme. */
function encrypt(bytes: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, ZERO_IV);
  return Buffer.concat([cipher.update(bytes), cipher.final()]);
}
