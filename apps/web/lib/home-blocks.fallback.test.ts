import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_HOME_BLOCKS } from './home-blocks';

/**
 * The landing page vanished once, and this is the pair of facts that did it.
 *
 * `getHomeBlocks()` ends with `blocks.length > 0 ? blocks : FALLBACK`, so
 * `DEFAULT_HOME_BLOCKS` is served ONLY while `home_blocks` is completely empty.
 * A seed migration that puts ONE row into an empty table therefore replaces the
 * whole landing page with that row — no hero, no h1, no WebGL scene.
 *
 * It happened on 2026-09-09 (PR #338): every landing-page e2e failed, none of
 * them naming the home blocks, and all of them passing under `next dev`.
 *
 * These two assertions are cheap and they close both halves of the trap.
 */
describe('the home-block fallback and its seed migration agree', () => {
  it('offers a whole landing page, not a fragment', () => {
    // If the fallback is ever reduced to a couple of blocks, an empty database
    // serves a broken page and nothing else notices.
    expect(DEFAULT_HOME_BLOCKS.length).toBeGreaterThanOrEqual(6);
    const types = DEFAULT_HOME_BLOCKS.map((b) => b.props.type);
    // The hero carries the `h1` and the WebGL scene three e2e specs assert on.
    expect(types).toContain('hero');
    expect(types).toContain('honorBoard');
  });

  it('never lets a home-block seed migration write into an EMPTY table', () => {
    // The guard, asserted against the SQL itself rather than a comment about
    // it. Any future seed migration under this name must keep the clause.
    // `process.cwd()` is `apps/web` under vitest — `import.meta.url` is not a
    // `file:` URL there, so `new URL(..., import.meta.url)` throws.
    const sql = readFileSync(
      resolve(
        process.cwd(),
        '../api/prisma/migrations/20260909030000_seed_honor_board_block/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM app\.home_blocks WHERE archived_at IS NULL\s*\)/);
  });
});
