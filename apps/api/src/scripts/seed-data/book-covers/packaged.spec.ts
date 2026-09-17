import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SEED_BOOK_COVERS } from './index';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * الأغلفة لازم توصل الصورة، مش بس تبقى في الريبو.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## The bug this exists for, verbatim
 *
 * The two first-year covers shipped to production and did not appear. The
 * files were committed, the seed ran, the books were there — and
 * `books.cover_key` kept pointing at the course art.
 *
 * `nest build` compiles TypeScript. It does not copy a `.webp` sitting beside
 * a `.ts`, so `dist/scripts/seed-data/book-covers/` held `index.js` and nothing
 * else, and `readSeedBookCover` threw `ENOENT` inside the container. The seed's
 * own "a cover is not worth failing a boot" guard then swallowed it into one
 * warning line in a deploy log nobody reads — which is exactly the shape of
 * failure that stays invisible: every layer behaved as designed and the feature
 * silently did not land.
 *
 * ## Why this asserts BOTH the file and the packaging rule
 *
 * Asserting the file exists passes on any developer's machine forever — the
 * source tree always has it. That is the green-test-over-a-dead-guard trap. The
 * thing that actually broke was the BUILD, so the build's own instruction is
 * what has to be pinned: `nest-cli.json` must carry an `assets` glob that
 * matches every file this manifest names.
 *
 * A third cover added to `SEED_BOOK_COVERS` under a path the glob does not
 * cover fails here, at the point the decision is made, rather than in a deploy
 * log four hours later.
 */

interface NestAsset {
  include?: string;
  outDir?: string;
}

const API_ROOT = path.resolve(import.meta.dirname ?? __dirname, '../../../..');

/** `src`-relative, which is what a `nest-cli.json` asset glob is written in. */
const SOURCE_ROOT = path.join(API_ROOT, 'src');

/**
 * The narrow slice of glob syntax these entries use: a `**` segment and `*`.
 * Written out rather than pulling in a matcher, because a dependency added to
 * test one string is a dependency every build then carries.
 *
 * ⚠️ It SPLITS on the double-star segment first and converts each piece
 * independently. Two earlier attempts did it as successive `.replace()` passes
 * and both were wrong the same way: whatever the double-star was rewritten into
 * still contained a star, so the single-star pass ran over its own output and
 * produced a pattern that matched nothing. Splitting means no pass ever sees
 * another pass's work.
 */
function globToRegExp(glob: string): RegExp {
  const piece = (part: string): string =>
    part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  const body = glob.split('**/').map(piece).join('(?:.*/)?');
  return new RegExp(`^${body}$`);
}

describe('seed book covers are packaged, not just committed', () => {
  const nestCli = JSON.parse(
    readFileSync(path.join(API_ROOT, 'nest-cli.json'), 'utf8'),
  ) as { compilerOptions?: { assets?: NestAsset[] } };
  const assets = nestCli.compilerOptions?.assets ?? [];

  it.each(SEED_BOOK_COVERS.map((cover) => [cover.bookSlug, cover] as const))(
    '%s — the file is in the repo',
    (_slug, cover) => {
      expect(existsSync(path.join(import.meta.dirname ?? __dirname, cover.file))).toBe(true);
    },
  );

  it.each(SEED_BOOK_COVERS.map((cover) => [cover.bookSlug, cover] as const))(
    '%s — and `nest build` is told to copy it into dist',
    (_slug, cover) => {
      const fromSourceRoot = path
        .relative(SOURCE_ROOT, path.join(import.meta.dirname ?? __dirname, cover.file))
        .split(path.sep)
        .join('/');

      const covered = assets.some(
        (asset) => asset.include !== undefined && globToRegExp(asset.include).test(fromSourceRoot),
      );

      /* The failure MESSAGE is the value, because jest's `expect` takes one
         argument — `expect(x, 'why')` is vitest, and jest answers it with
         "Expect takes at most one argument", which says nothing about covers.
         Comparing strings puts the explanation in the diff instead. */
      expect(
        covered
          ? 'covered by a nest-cli.json asset glob'
          : `NOT covered: ${fromSourceRoot} — it will be committed and then missing from ` +
            `the image, and the seed will skip it with a warning nobody reads.`,
      ).toBe('covered by a nest-cli.json asset glob');
    },
  );

  /** The storage keys are PINNED — `books.cover_key` points at them. Two covers
   *  sharing one key would mean the second `put` hits the "never overwrite"
   *  guard and both books wear the first cover. */
  it('gives every cover its own storage key and asset id', () => {
    const keys = SEED_BOOK_COVERS.map((cover) => cover.storageKey);
    const ids = SEED_BOOK_COVERS.map((cover) => cover.assetId);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** `LocalDiskStorage.resolveKey` refuses anything that is not `<2 hex>/<uuid>.webp`,
   *  and it refuses it by THROWING — a malformed key here is a boot-time warning,
   *  not a broken image. */
  it('uses keys the storage layer will accept', () => {
    for (const cover of SEED_BOOK_COVERS) {
      expect(cover.storageKey).toMatch(/^[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$/);
      /* The directory prefix is the id's own first two characters — the shape
         `MediaService` mints, so these sit where every other image sits. */
      expect(cover.storageKey.slice(0, 2)).toBe(cover.assetId.slice(0, 2));
    }
  });
});
