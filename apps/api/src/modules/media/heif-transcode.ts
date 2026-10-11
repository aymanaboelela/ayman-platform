import { ServiceUnavailableException } from '@nestjs/common';

/**
 * HEIC/HEIF in, JPEG out — for the build of sharp that cannot decode it.
 *
 * ## ⚠️ What was actually running in production until 2026-10-11
 *
 * The first version of this (#443) handed HEIC to **ffmpeg**, and was proved
 * on a Mac with ffmpeg 8. The runtime image is `node:24-slim`, which is Debian
 * 12 (bookworm), whose ffmpeg is **5.1** — and ffmpeg 5.1 has no HEIF demuxer
 * at all. Measured in that exact image, on both a 1200×1600 HEIC and a real
 * iPhone-shaped 4032×3024 tile grid:
 *
 *     moov atom not found
 *     Invalid data found when processing input        → exit 1
 *
 * So every HEIC that reached the API was refused, and the student read «ده مش
 * ملف صورة» about a photo her own phone took.
 *
 * `heif-convert` (Debian's `libheif-examples`, libheif 1.15 + libde265 on
 * bookworm) decodes both, grid included, in the same image. It is tried first;
 * `heif-dec` is the same tool under the name libheif ≥ 1.17 gives it; ffmpeg
 * stays last, for the day the base image moves to trixie (ffmpeg 7.1, which
 * does read HEIF) and for the Mac this is developed on.
 *
 * ## ⚠️ The output is already UPRIGHT — the caller must not rotate it again
 *
 * libheif applies the container's own `irot`/`imir` boxes while decoding, and
 * then COPIES the EXIF block into the JPEG — Orientation tag included. An
 * iPhone writes both. Measured: a portrait HEIC came out 300×400 and upright,
 * still tagged orientation 6, and sharp's `.rotate()` turned it sideways. The
 * pixels are the truth here; the tag is a stale copy.
 *
 * ## ⚠️ Temp files, not pipes
 *
 * HEIF is an ISO-BMFF container: the frame offsets live in a box the decoder
 * seeks to, so it cannot be read from a stream — `ffmpeg -i pipe:0` on a valid
 * HEIC exits 176 with «Not yet implemented in FFmpeg, patches welcome», which
 * is indistinguishable from a corrupt upload if you only check the code.
 *
 * ## ⚠️ Bounded, because three stacks share four cores
 *
 * The book-order receipt upload is public, so a few dozen files that look like
 * HEIC used to be able to start a few dozen decoders at once — enough to stall
 * all three stacks on this VPS (see CLAUDE.md §5). Hence at most
 * `MAX_TRANSCODES` running, a short queue behind them, `nice` on the libheif
 * tools (they decode a tile grid on several threads and take no flag to stop
 * that), `-threads 1` on ffmpeg, and a hard 20s kill. A real student's photo
 * waits a moment at worst; past the queue the upload is refused with a 503
 * rather than parked.
 */

const MAX_TRANSCODES = 2;
const MAX_QUEUED_TRANSCODES = 8;
const TIMEOUT_MS = 20_000;
let runningTranscodes = 0;
const transcodeQueue: Array<() => void> = [];

async function withTranscodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (runningTranscodes >= MAX_TRANSCODES) {
    if (transcodeQueue.length >= MAX_QUEUED_TRANSCODES) {
      throw new ServiceUnavailableException('image conversion is busy, try again shortly');
    }
    await new Promise<void>((resolve) => transcodeQueue.push(resolve));
  }
  runningTranscodes += 1;
  try {
    return await work();
  } finally {
    runningTranscodes -= 1;
    transcodeQueue.shift()?.();
  }
}

/**
 * The converters, in the order they are tried. Each writes `target`; the
 * libheif tools write `out-1.jpg`, `out-2.jpg`… instead when the file holds
 * more than one top-level image, which `readOutput` accounts for.
 *
 * `-q 92` / `-q:v 2` are near-lossless on purpose: this is an intermediate
 * that sharp re-encodes straight after, so a lower setting would only buy
 * generation loss on a photograph of someone's handwriting.
 */
function converters(source: string, target: string): Array<[string, string[]]> {
  return [
    ['nice', ['-n', '10', 'heif-convert', '-q', '92', source, target]],
    ['nice', ['-n', '10', 'heif-dec', '-q', '92', source, target]],
    [
      'ffmpeg',
      // `-frames:v 1`: a HEIC *sequence* (a burst) holds many frames, and
      // without the cap ffmpeg writes one JPEG per frame.
      ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-i', source, '-frames:v', '1', '-q:v', '2', target],
    ],
  ];
}

async function run(command: string, args: string[]): Promise<void> {
  const { spawn } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(0, 500);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args[0] ?? ''} exited ${code}: ${stderr}`));
    });
  });
}

async function readOutput(dir: string, target: string): Promise<Buffer> {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    return await readFile(target);
  } catch {
    // More than one image in the container: the primary is written first.
    const numbered = (await readdir(dir)).filter((name) => /^out-\d+\.jpg$/.test(name)).sort();
    if (numbered.length === 0) throw new Error('converter wrote no output');
    return readFile(join(dir, numbered[0]!));
  }
}

async function convert(input: Buffer): Promise<Buffer> {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'heif-'));
  const source = join(dir, 'in.heic');
  const target = join(dir, 'out.jpg');
  try {
    await writeFile(source, input);
    let lastError: unknown = new Error('no HEIF converter is installed');
    for (const [command, args] of converters(source, target)) {
      try {
        await run(command, args);
        return await readOutput(dir, target);
      } catch (error) {
        // ENOENT (tool not installed) or a decode failure — either way the
        // next converter may still read it.
        lastError = error;
      }
    }
    throw lastError;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * An object rather than a bare function so a unit test can replace `toJpeg`
 * with `jest.spyOn` — the CI runner has none of these tools installed, and a
 * test that depends on the machine it runs on measures the machine.
 */
export const heifTranscoder = {
  toJpeg(input: Buffer): Promise<Buffer> {
    return withTranscodeSlot(() => convert(input));
  },
};
