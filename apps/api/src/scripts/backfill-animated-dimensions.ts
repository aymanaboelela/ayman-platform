/**
 * Repairs `media_asset.width/height` for uploads that were stored as a FRAME
 * STRIP instead of a frame.
 *
 * ## What went wrong
 *
 * `MediaService.upload()` and `uploadAvatar()` both persisted the `width` and
 * `height` that `sharp(...).toBuffer({ resolveWithObject: true })` reports. For
 * a single-page image those are the image. For a MULTI-PAGE encode they are the
 * whole stacked strip: a 3-frame 40×30 animation comes back as 40×90, and a
 * 4-frame 512px avatar as 512×2048.
 *
 * Both call sites now write `info.pageHeight ?? info.height`, so nothing new is
 * wrong. Every animated asset uploaded BEFORE that fix still holds the strip
 * height, and the columns are not cosmetic — they are what a consumer builds an
 * aspect-ratio box from, so an animated asset reserves N times too much
 * vertical space and then collapses to a fraction of it on decode. That is a
 * layout shift served from the database, and no amount of care in the web app
 * can correct it without knowing the frame count.
 *
 * ## Why it re-probes the bytes instead of doing arithmetic in SQL
 *
 * Nothing in the row says "animated". Every upload is re-encoded to one output
 * mime, so `mime` cannot distinguish them, and the frame count was never
 * stored. A pure-SQL guess — "height is an exact multiple of width", say —
 * would rewrite legitimately tall stills. The only source of truth is the
 * object itself, so this reads each one and asks sharp.
 *
 * ## What it will and will not touch
 *
 * A row is repaired only when ALL of these hold:
 *
 *   · the stored object decodes, and reports `pages > 1`;
 *   · it reports a `pageHeight`;
 *   · the stored height EQUALS `pageHeight × pages` — i.e. the row is exactly
 *     the strip-height bug and not some other disagreement;
 *   · the stored width already matches (the width was never wrong; if it does
 *     not match, something else is going on and the row is reported, not
 *     written).
 *
 * That last pair is the point. A row that is wrong for an unknown reason is
 * listed for a human rather than quietly overwritten by a script whose author
 * had one specific bug in mind.
 *
 * ## Running it
 *
 * DRY RUN by default — it reports and writes nothing. Pass `--apply` to commit.
 *
 *     # in the container, after a deploy (compiled, like create-admin.ts)
 *     docker exec -w /app/apps/api <api-container> \
 *       node dist/scripts/backfill-animated-dimensions.js
 *     docker exec -w /app/apps/api <api-container> \
 *       node dist/scripts/backfill-animated-dimensions.js --apply
 *
 * Idempotent: a repaired row no longer satisfies `height === pageHeight × pages`
 * (unless the animation has exactly one frame, which `pages > 1` excludes), so
 * a second run finds nothing to do. Safe to re-run after a partial failure.
 *
 * It lives under `src/` for the reason `create-admin.ts` documents: only `src/**`
 * is compiled and only `dist/` ships in the runtime image.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import { PrismaClient } from '../generated/prisma/client';
import { LocalDiskStorage } from '../modules/media/storage/local-disk.storage';
import { loadEnv } from '../config/env';

const apply = process.argv.includes('--apply');

/** Rows per query. Large enough to be few round trips, small enough that the
 *  buffers of one page never sit in memory together with the next. */
const PAGE_SIZE = 200;

interface Finding {
  id: string;
  storageKey: string;
  storedWidth: number;
  storedHeight: number;
  frameWidth: number;
  frameHeight: number;
  pages: number;
}

async function readAll(storage: LocalDiskStorage, key: string): Promise<Buffer> {
  const stream = await storage.getStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const storage = new LocalDiskStorage(env.MEDIA_ROOT);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  const repairable: Finding[] = [];
  const oddities: Array<Finding & { reason: string }> = [];
  let scanned = 0;
  let animated = 0;
  let unreadable = 0;
  let cursor: string | undefined;

  process.stdout.write(
    `${apply ? 'APPLYING' : 'DRY RUN — nothing will be written. Pass --apply to commit.'}\n\n`,
  );

  for (;;) {
    const rows = await prisma.mediaAsset.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, storageKey: true, width: true, height: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    for (const row of rows) {
      scanned += 1;
      if (row.width === null || row.height === null) continue;

      let meta;
      try {
        meta = await sharp(await readAll(storage, row.storageKey), { animated: true }).metadata();
      } catch (error) {
        // A missing or unreadable object is worth reporting but is not this
        // script's problem to solve — it is already broken on the page.
        unreadable += 1;
        process.stdout.write(
          `  ⚠ ${row.id} — could not read ${row.storageKey}: ${(error as Error).message}\n`,
        );
        continue;
      }

      const pages = meta.pages ?? 1;
      if (pages <= 1 || !meta.pageHeight) continue;
      animated += 1;

      const finding: Finding = {
        id: row.id,
        storageKey: row.storageKey,
        storedWidth: row.width,
        storedHeight: row.height,
        frameWidth: meta.width ?? row.width,
        frameHeight: meta.pageHeight,
        pages,
      };

      if (row.height === meta.pageHeight && row.width === finding.frameWidth) continue; // already correct

      if (row.width !== finding.frameWidth) {
        oddities.push({ ...finding, reason: 'stored width does not match the decoded frame width' });
        continue;
      }
      if (row.height !== meta.pageHeight * pages) {
        oddities.push({
          ...finding,
          reason: `stored height ${row.height} is not pageHeight × pages (${meta.pageHeight} × ${pages})`,
        });
        continue;
      }

      repairable.push(finding);
    }
  }

  process.stdout.write(
    `\nscanned ${scanned} assets — ${animated} animated, ${repairable.length} to repair, ` +
      `${oddities.length} needing a human, ${unreadable} unreadable\n\n`,
  );

  for (const f of repairable) {
    process.stdout.write(
      `  ${apply ? 'fixing ' : 'would fix '}${f.id}  ${f.storedWidth}×${f.storedHeight} → ` +
        `${f.frameWidth}×${f.frameHeight}  (${f.pages} frames)\n`,
    );
  }

  if (oddities.length > 0) {
    process.stdout.write(`\n  These are animated but do NOT match the known bug — left alone:\n`);
    for (const o of oddities) {
      process.stdout.write(`  · ${o.id} (${o.storageKey}): ${o.reason}\n`);
    }
  }

  if (apply && repairable.length > 0) {
    // One statement per row rather than a transaction over all of them: the
    // updates are independent, and a single bad row must not roll back a
    // repair that had already succeeded for the rest.
    let written = 0;
    for (const f of repairable) {
      await prisma.mediaAsset.update({
        where: { id: f.id },
        data: { width: f.frameWidth, height: f.frameHeight },
      });
      written += 1;
    }
    process.stdout.write(`\nwrote ${written} rows\n`);
  } else if (!apply && repairable.length > 0) {
    process.stdout.write(`\nnothing written — re-run with --apply\n`);
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
