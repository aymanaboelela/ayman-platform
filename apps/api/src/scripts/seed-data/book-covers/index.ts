import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * أغلفة كتب أولى بكالوريا — ملفات في الريبو، مش رفع بالإيد.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ayman sent two cover images with the two books. Uploading them by hand
 * through `/admin/books/catalog` would have worked on production and nowhere
 * else: every other database — staging, a fresh checkout, a reviewer's laptop —
 * would show the two new books wearing their COURSE's cover, and the next
 * person to look would not be able to tell a placeholder from the real thing.
 * The books themselves ship as a migration for exactly that reason
 * (`20260916000200_year1_books`); their covers ship the same way.
 *
 * ## Why the storage key is FIXED and not `randomUUID()`
 *
 * The seed runs on EVERY container boot. A generated key would write a new
 * object each time and leave the previous one orphaned in the volume — a slow
 * leak that nothing lists, because these objects have no `media_assets` row
 * until the seed makes one. A constant key makes the write idempotent by
 * construction: the second boot finds the object already there and does
 * nothing.
 *
 * The uuids below are arbitrary v4s generated once, by hand, and pinned. They
 * must never change: `books.cover_key` points at them, and editing one orphans
 * a live cover.
 *
 * ## Why the bytes are `.webp` and already sized
 *
 * `MediaService` re-encodes uploads through sharp precisely so that what is
 * stored is what is served. The seed does not go through that pipeline — it
 * writes to storage directly — so the files are pre-encoded to the same output
 * shape the pipeline produces: webp, 1000px wide, quality 80. Anything else
 * would be the one image on the platform whose bytes nobody had gated.
 *
 * ## Why this is not a `.ts` file with base64 in it
 *
 * ~155 KB each. Inlined they would be ~210 KB of base64 in a module every
 * `tsc` run parses and every bundle analyser trips over, to save one `readFile`
 * that happens once per boot.
 */
export interface SeedBookCover {
  /** `books.slug` — the row this cover belongs to. */
  bookSlug: string;
  /** The file, beside this module. */
  file: string;
  /** ⚠️ PINNED. See the note above: changing one orphans a live cover. */
  storageKey: string;
  /** `media_assets.id`, pinned for the same reason. */
  assetId: string;
  /** What `/admin/media` shows it as, so it can be found and replaced. */
  filename: string;
  altAr: string;
}

export const SEED_BOOK_COVERS: readonly SeedBookCover[] = [
  {
    bookSlug: 'programming-cs-year1-2027-general',
    file: 'year1-general.webp',
    storageKey: '7c/7c1a4f60-0b2e-4d51-9a33-5f0c8e21a901.webp',
    assetId: '7c1a4f60-0b2e-4d51-9a33-5f0c8e21a901',
    filename: 'كتاب-اولى-بكالوريا-برمجة-عربي.webp',
    altAr: 'غلاف كتاب أولى بكالوريا — برمجة عربي',
  },
  {
    bookSlug: 'programming-cs-year1-2027-languages',
    file: 'year1-languages.webp',
    storageKey: '3e/3e9d2b84-6c07-4a19-8f52-b1d7a4e63c28.webp',
    assetId: '3e9d2b84-6c07-4a19-8f52-b1d7a4e63c28',
    filename: 'كتاب-اولى-بكالوريا-برمجة-لغات.webp',
    altAr: 'غلاف كتاب أولى بكالوريا — برمجة لغات',
  },
];

/**
 * Reads one cover's bytes.
 *
 * ## Resolved against THIS MODULE, never against `process.cwd()`
 *
 * The seed is run by `tsx` from `apps/api`, by the Docker entrypoint from
 * `/app`, and by a developer from the repo root. A relative path would find the
 * files in exactly one of those three.
 *
 * ## Why `__dirname` and not `import.meta.dirname`
 *
 * ⚠️ This package is `"type": "commonjs"` and `tsc` emits CJS, so
 * `import.meta.dirname` is `undefined` at runtime even though TypeScript
 * accepts it — which is how it got written, and the failure is not a type
 * error. It surfaced as `path.join(undefined, …)` on the first real boot and
 * was swallowed by the caller's own "a cover is not worth failing a deploy
 * over" guard, i.e. two covers silently not installed and one warning nobody
 * was looking for.
 */
export async function readSeedBookCover(cover: SeedBookCover): Promise<Buffer> {
  return readFile(path.join(__dirname, cover.file));
}
