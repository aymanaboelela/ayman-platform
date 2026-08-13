import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `mediaUrl()` takes a storage KEY. Nothing may hand it an asset ID.
 *
 * ## The failure this exists for
 *
 * `app/layout.tsx` rendered the branded favicon as:
 *
 *     mediaUrl(`${branding.faviconAssetId}.webp`)
 *
 * A storage key is `<2 hex>/<uuid>.webp` — TWO path segments, which is the
 * shape `GET /media/:prefix/:name` routes on. An asset id with `.webp` glued
 * to it is one segment, so it matched no route and returned 404. Every favicon
 * an admin ever chose was broken, and so was every `og:image`
 * (`lib/seo/metadata.ts` had the identical line).
 *
 * ## Why nothing caught it
 *
 * It TYPE-CHECKS. `faviconAssetId` is a `string`, `mediaUrl` accepts a
 * `string`, and the template literal is a `string`. Every guard the repo has
 * stayed green:
 *
 *   - typecheck passed
 *   - the build passed
 *   - every unit and e2e test passed
 *
 * …and the browser showed its default globe in the tab, which is exactly what
 * "no favicon configured" also looks like. There was no observable difference
 * between the feature being broken and the feature being unused.
 *
 * It also came back once during the fix: a concurrent session in the same
 * worktree restored the old line, and nothing failed. This test is the thing
 * that fails.
 *
 * ## Why a source scan rather than a runtime check
 *
 * `mediaUrl` is called in render, on every card of the catalogue — validating
 * a regex there costs work on a hot path to catch a mistake that can only be
 * made while writing code. Reading the sources catches it at the moment it
 * lands, everywhere, for free.
 */

const WEB = join(import.meta.dirname, '..');

const SCAN_ROOTS = ['app', 'components', 'lib'];
const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // `.next` holds compiled copies of this same source; scanning them would
    // report every finding twice and at a path nobody can edit.
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry) && !full.endsWith('media-key-shape.test.ts')) out.push(full);
  }
  return out;
}

/**
 * A `mediaUrl(...)` argument that INTERPOLATES something whose name ends in
 * `AssetId` (or is literally an id) and appends an extension.
 *
 * Deliberately narrow. It does not try to prove an argument IS a valid key —
 * `coverKey`, `posterKey` and `storageKey` are all legitimately passed through
 * variables this cannot inspect. It catches the one construction that is
 * always wrong: gluing an extension onto an id.
 */
const ID_AS_KEY = /mediaUrl\(\s*`\$\{[^}]*(?:AssetId|assetId)[^}]*\}\.[a-z]{3,4}`/;

describe('media URL construction', () => {
  it('never builds a storage key by appending an extension to an asset id', () => {
    const offenders = walk(join(WEB, SCAN_ROOTS[0]!))
      .concat(...SCAN_ROOTS.slice(1).map((root) => walk(join(WEB, root))))
      .filter((file) => ID_AS_KEY.test(readFileSync(file, 'utf8')))
      .map((file) => relative(WEB, file))
      .sort();

    expect(
      offenders,
      `mediaUrl() takes a storage key (\`<2 hex>/<uuid>.webp\`), not an asset id.\n` +
        `Resolve the id to its key on the API — see BrandingReadSchema — in:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  /**
   * Proves the matcher would actually have caught the shipped bug, rather than
   * being a regex that matches nothing and passes forever.
   */
  it('recognises the exact line that shipped', () => {
    expect(ID_AS_KEY.test('mediaUrl(`${branding.faviconAssetId}.webp`)')).toBe(true);
    expect(ID_AS_KEY.test('mediaUrl(`${seo.ogImageAssetId}.webp`)')).toBe(true);
  });

  it('leaves a genuine storage key alone', () => {
    expect(ID_AS_KEY.test('mediaUrl(course.coverKey)')).toBe(false);
    expect(ID_AS_KEY.test('mediaUrl(branding.faviconKey)')).toBe(false);
    expect(ID_AS_KEY.test('mediaUrl(asset.storageKey)')).toBe(false);
  });
});
