import { execFile, spawn } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { cpus, loadavg } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { UPLOAD_LADDER, type LadderRung } from '@ayman/contracts/video';
import type { MirrorStorage } from './mirror-storage';
import {
  lowRungArgs,
  readMasterVariants,
  readMediaPlaylist,
  readProbe,
  segmentBoundaries,
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

/** Heights of the rungs still worth building: shorter than the source, not already there. */
export function rungsToBuild(existingHeights: readonly number[], sourceHeight: number): LadderRung[] {
  return UPGRADE_RUNGS.filter((rung) => rung.height < sourceHeight && !existingHeights.includes(rung.height));
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

async function listFiles(dir: string, root = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, root)));
    else out.push(relative(root, full));
  }
  return out.sort();
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
  /** Roughly what the lecture weighs in the bucket; the work dir needs about twice that. */
  readonly expectedBytes: number;
}

export interface UpgradeResult {
  /** Every height the lecture offers now, tallest first. */
  readonly heights: number[];
  /** Bytes ADDED to the bucket. */
  readonly addedBytes: number;
  /** Nothing was missing — no rung built, master untouched. */
  readonly nothingToDo: boolean;
}

/** Build the missing rungs from the tallest one in the bucket, and publish them. */
export async function upgradeLadder(deps: UpgradeDeps): Promise<UpgradeResult> {
  const { storage, prefix, key, work } = deps;
  const master = await storage.readText(`${prefix}/master.m3u8`);
  const variants = variantSizes(master);
  if (variants.length === 0) throw new Error('ملف الجودات مش فيه أي جودة');
  const top = variants.reduce((a, b) => (b.height > a.height ? b : a));
  const todo = rungsToBuild(
    variants.map((v) => v.height),
    top.height,
  );
  const heightsNow = variants.map((v) => v.height).sort((a, b) => b - a);
  if (todo.length === 0) return { heights: heightsNow, addedBytes: 0, nothingToDo: true };

  /*
   * The source is one file as big as the lecture, and the new rungs come on top.
   * A full disk fails the encode at 90% and — worse — takes the database's
   * volume with it, so it is checked BEFORE a byte is downloaded.
   */
  const free = await statfs(work).then((f) => Number(f.bavail) * Number(f.bsize)).catch(() => Infinity);
  const needed = deps.expectedBytes * 2 + 500 * 1024 * 1024;
  if (free < needed) {
    throw new Error(
      `مفيش مساحة كفاية على السيرفر: محتاج حوالي ${Math.ceil(needed / 1024 ** 3)} جيجا وفاضل ${Math.floor(free / 1024 ** 3)}`,
    );
  }

  /* ── 1. the tallest rung back out of the bucket, decrypted, as one file ── */
  const topDir = dirname(top.uri);
  const playlistText = await storage.readText(`${prefix}/${top.uri}`);
  const media = readMediaPlaylist(playlistText);
  const boundaries = segmentBoundaries(playlistText);
  const encoding = readSegmentEncoding(playlistText);
  if (encoding.encrypted && key === null) throw new Error('الفيديو مشفّر ومفيش مفتاح');

  const source = join(work, encoding.init ? 'source.mp4' : 'source.ts');
  const sink = createWriteStream(source);
  const write = (chunk: Buffer): Promise<void> =>
    new Promise((resolve, reject) => sink.write(chunk, (error) => (error ? reject(error) : resolve())));

  const pieces = [...(encoding.init ? [{ uri: encoding.init, sequence: -1 }] : []), ...media.segments.map((s, i) => ({ uri: s.uri, sequence: i }))];
  const scratch = join(work, 'dl');
  await mkdir(scratch, { recursive: true });
  try {
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i]!;
      const file = join(scratch, 'piece');
      await storage.downloadTo(`${prefix}/${topDir}/${piece.uri}`, file);
      let bytes = await readFile(file);
      // The init segment (fMP4) is never encrypted; every media segment is,
      // with the playlist's IV or, absent that, its own sequence number.
      if (encoding.encrypted && piece.sequence >= 0) {
        const decipher = createDecipheriv('aes-128-cbc', key!, encoding.iv ?? sequenceIv(piece.sequence));
        bytes = Buffer.concat([decipher.update(bytes), decipher.final()]);
      }
      await write(bytes);
      if (i % 25 === 0) deps.onProgress(5 + Math.floor((i / pieces.length) * 20));
    }
  } finally {
    await new Promise<void>((resolve) => sink.end(resolve));
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }

  const probed = await run(
    deps.ffprobe,
    ['-hide_banner', '-loglevel', 'error', '-print_format', 'json', '-show_format', '-show_streams', source],
    { maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60_000 },
  );
  const probe = readProbe(probed.stdout);

  /* ── 2. the missing rungs, each on the tallest rung's boundaries ───────── */
  const outRoot = join(work, 'out');
  let keyInfoFile: string | null = null;
  if (encoding.encrypted) {
    const keyFile = join(work, 'video.key');
    keyInfoFile = join(work, 'video.keyinfo');
    await writeFile(keyFile, key!, { mode: 0o600 });
    await writeFile(keyInfoFile, `${deps.keyUri}\n${keyFile}\n`, { mode: 0o600 });
  }

  let nextMaster = master;
  const measured = new Map<string, VariantBandwidth>();
  for (let i = 0; i < todo.length; i += 1) {
    const rung = todo[i]!;
    // New directories go AFTER whatever the master already lists, so a rung
    // that is already in the bucket is never overwritten under a student.
    const index = variants.length + i;
    const dir = join(outRoot, String(index));
    await mkdir(dir, { recursive: true });
    await waitUntilCalm(deps.throttle);
    await runThrottled(
      deps.ffmpeg,
      lowRungArgs(source, dir, probe.hasAudio, boundaries, deps.threads, keyInfoFile, rung),
      deps.throttle,
      { renice: deps.renice, timeoutMs: 12 * 60 * 60_000 },
    );

    const made = readMediaPlaylist(await readFile(join(dir, 'index.m3u8'), 'utf8'));
    if (made.segments.length !== media.segments.length) {
      throw new Error(
        `جودة ${rung.height}p طلعت ${made.segments.length} قطعة بدل ${media.segments.length} — مش هترفعها عشان التبديل ما يهنّجش`,
      );
    }
    const sizes = [];
    for (const segment of made.segments) {
      sizes.push({ durationSeconds: segment.durationSeconds, bytes: (await stat(join(dir, segment.uri))).size });
    }
    const uri = `${index}/index.m3u8`;
    const width = Math.max(2, Math.round((top.width * rung.height) / top.height / 2) * 2);
    nextMaster = withRung(nextMaster, uri, width, rung.height, rung.maxKbps);
    const bandwidth = variantBandwidth(sizes, made.targetDurationSeconds);
    if (bandwidth !== null) measured.set(uri, bandwidth);
    deps.onProgress(25 + Math.floor(((i + 1) / todo.length) * 60));
  }
  await writeFile(join(outRoot, 'master.m3u8'), withMeasuredBandwidth(nextMaster, measured));

  /* ── 3. publish: segments first, the master LAST (`uploadLadder` orders it) ── */
  const files = await listFiles(outRoot);
  let addedBytes = 0;
  for (const file of files) addedBytes += (await stat(join(outRoot, file))).size;
  deps.onProgress(90);
  await storage.uploadLadder(outRoot, files, prefix);

  return {
    heights: [...heightsNow, ...todo.map((r) => r.height)].sort((a, b) => b - a),
    addedBytes,
    nothingToDo: false,
  };
}
