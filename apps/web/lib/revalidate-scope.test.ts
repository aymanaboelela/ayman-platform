import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `revalidatePath('/', 'layout')` is banned in the student area.
 *
 * It reads like "refresh the shell" and it is nothing of the sort. Verified in
 * the installed next@16.2.11: `revalidate.js:81-100` turns it into the tag
 * `${NEXT_CACHE_IMPLICIT_TAG_ID}/layout`, and `implicit-tags.js:15-18` puts
 * `/layout` in EVERY route's implicit tag set — so the tag is about all routes,
 * not the one that fired it. `use-cache-wrapper.js:1529-1535` then discards any
 * `'use cache'` entry whose timestamp predates the expiry, and this repo's own
 * `cache-handler/redis.js:430-452` writes that expiry into the shared
 * `next:tags` hash, which `:391-411` HGETALLs into every replica before each
 * request. It is a cluster-wide cache purge.
 *
 * It shipped in two places, both of them mundane: marking a notification read,
 * and changing an avatar. One student tapping one bell row therefore cold-
 * started `getBranding()`, `getPublicSettingsOrDefaults()`,
 * `getCatalogOrEmpty()`, `getCourse()`, `getHomeBlocks()`, `getNewsList()`,
 * `getTaxonomyOrNull()` and `highlightCode()`'s `cacheLife('max')` Shiki output
 * — for whoever landed next, anywhere on the platform, signed in or not. In
 * both cases the data that had actually changed was not cached at all, so not
 * one of those entries needed touching.
 *
 * The replacement is `refresh()`, which re-renders the dynamic tree and leaves
 * every cache entry alone. When a scoped invalidation IS genuinely needed, it
 * is `updateTag(tags.x())` against a named tag from `lib/cache-tags.ts` — see
 * `lib/cache-tags.test.ts`, which fails if a tag has no loader claiming it.
 *
 * This is a test rather than an ESLint rule because the repo's only custom rule
 * (`@ayman/config/eslint`'s `no-physical-direction`) is a JSX-attribute
 * matcher, and a one-literal ban does not justify a second rule module. The
 * failure message carries the reasoning, which is the part that matters.
 */
const APP_GROUP = join(import.meta.dirname, '..', 'app', '(app)');

/**
 * The literal in all its spellings — single, double and backtick quotes, plus
 * the line breaks and trailing comma Prettier introduces the moment the call
 * grows past the print width. Written as one pattern rather than a plain
 * `includes()` so that PROSE mentioning the call (both replaced call sites now
 * document at length why they no longer use it) does not trip the rule;
 * comments are stripped before matching for the same reason.
 */
const BANNED = /revalidatePath\(\s*(['"`])\/\1\s*,\s*(['"`])layout\2\s*,?\s*\)/;

/**
 * Comments only. Not a parser — it does not know that a `//` inside a string
 * literal is not a comment — and it does not need to be: the cost of an
 * over-eager strip here is a banned call hiding inside a string literal, which
 * is not a call.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the (app) group's server actions", () => {
  it("never purges every replica's cache to refresh one badge", () => {
    const offenders = sourceFiles(APP_GROUP)
      .filter((file) => BANNED.test(withoutComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(APP_GROUP, file));

    expect(
      offenders,
      `revalidatePath('/', 'layout') in: ${offenders.join(', ')}. It expires the implicit ` +
        '/layout tag, which every route carries, so it discards EVERY `use cache` entry in ' +
        'the cluster — not just this route group. Use refresh() to re-render the dynamic ' +
        'tree, or updateTag(tags.x()) against a named tag from lib/cache-tags.ts.',
    ).toEqual([]);
  });
});
