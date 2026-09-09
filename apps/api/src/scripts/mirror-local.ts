/**
 * ══════════════════════════════════════════════════════════════════════════
 * Mirror lectures from a machine YouTube will talk to.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The worker on the VPS cannot do this. YouTube answers a data-centre IP with
 * «Sign in to confirm you're not a bot» for every Innertube client we have —
 * the address is the problem, not the code, and no retry outlasts it. A
 * residential connection is not refused, so the backfill runs from a laptop.
 *
 * This is deliberately NOT a second implementation of the pipeline. It calls
 * the worker's own `mirrorVideo` and `MirrorStorage`, so the bucket ends up
 * byte-for-byte what the worker would have written: same rung choice, same
 * key prefix, same content types. Anything else would be a second definition
 * of «our copy» that drifts from the first one silently.
 *
 * The database is untouched here — this script only fills the bucket. The
 * worker adopts what it finds (see `mirrorOne`), which is what turns these
 * objects into a `ready` row without the VPS ever calling YouTube.
 *
 *   EP=https://<account>.r2.cloudflarestorage.com \
 *   AK=<access key> SK=<secret> \
 *   pnpm --filter @ayman/api exec tsx src/scripts/mirror-local.ts <id> [id...]
 */
import { basename } from 'node:path';
import { mirrorPrefix } from '@ayman/contracts/video';
import { DEFAULT_TOOLS, mirrorVideo } from '../modules/video-mirror/mirror-pipeline';
import { MirrorStorage } from '../modules/video-mirror/mirror-storage';

const ids = process.argv.slice(2);
if (ids.length === 0) {
  throw new Error('usage: mirror-local.ts <youtubeId> [youtubeId...]');
}

for (const key of ['EP', 'AK', 'SK'] as const) {
  if (!process.env[key]) throw new Error(`missing ${key}`);
}

/*
 * A ladder for one lecture is several gigabytes twice over — the downloaded
 * rungs and then the packaged segments — and a laptop's boot volume is the
 * wrong place for that. `os.tmpdir()` re-reads this on every call, so setting
 * it here rather than in the environment keeps `tsx` itself on the real
 * `/tmp`: it opens a unix socket there, and an external ExFAT volume cannot
 * host one.
 */
if (process.env.MIRROR_TMPDIR) process.env.TMPDIR = process.env.MIRROR_TMPDIR;

async function main(): Promise<void> {
  const storage = new MirrorStorage({
    endpoint: process.env.EP as string,
    bucket: process.env.BUCKET ?? 'ayman-video',
    accessKeyId: process.env.AK as string,
    secretAccessKey: process.env.SK as string,
    publicUrl: process.env.PUBLIC_URL ?? 'https://video.aymanaboelela.com',
    concurrency: 1,
  });

  for (const id of ids) {
    const started = Date.now();
    process.stdout.write(`${id} … `);
    try {
      const result = await mirrorVideo(id, {
        ...DEFAULT_TOOLS,
        // `MAX_HEIGHT=720` stops at the 720p rung. The top rung is more than
        // half the bytes of a ladder, and on the screens this feature exists
        // for it is not a visible difference.
        maxPixels: process.env.MAX_HEIGHT
          ? Math.round((16 / 9) * Number(process.env.MAX_HEIGHT)) * Number(process.env.MAX_HEIGHT)
          : undefined,
      });
      const prefix = mirrorPrefix(id);
      // Same order as the worker: clear, then upload. A re-mirror that lost a
      // rung must not leave the old rung's segments reachable.
      await storage.deletePrefix(prefix);
      /*
       * macOS writes an AppleDouble sidecar (`._seg_004.m4s`) next to every
       * file on a volume that cannot hold extended attributes — an external
       * ExFAT disk, which is where a laptop has room for this. They are four
       * kilobytes of nothing, no player asks for them, and uploading them
       * doubles the object count of every lecture. The worker on Linux never
       * produces one, so this belongs here and not in the pipeline.
       */
      const files = result.files.filter((f) => !basename(f).startsWith('._'));
      await storage.uploadLadder(result.dir, files, prefix);
      await result.cleanup();
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(
        `ok ${result.maxHeight}p · ${Math.round(result.bytes / 1e6)}MB · ` +
          `${files.length} files · ${seconds}s`,
      );
    } catch (error) {
      console.log(`FAILED ${(error as Error).message.slice(0, 300)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
