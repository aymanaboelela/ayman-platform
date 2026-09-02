import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Nothing named `node_modules` may be a TRACKED path, in any package.
 *
 * Written after it happened. Working in a fresh worktree here means borrowing
 * the main checkout's `node_modules` by symlink — `pnpm install` in a new
 * worktree takes 30+ minutes on this machine and times out — and the root
 * `.gitignore` said `node_modules/`, with a trailing slash, which matches a
 * DIRECTORY. A symlink is a file to git, so three of those links went in with a
 * `git add -A packages` and nothing complained.
 *
 * What that costs is out of all proportion to the mistake: CI failed EVERY job,
 * including `lint + typecheck` and all four Playwright shards, at `pnpm
 * install` — `packages/config/node_modules` existed as a link to a path no
 * runner has, so pnpm's own mkdir hit ENOENT and the install exited 254. The
 * change under review was fine. Nothing in the logs pointed at the symlink
 * except one line inside a wall of install output.
 *
 * The `.gitignore` was fixed to the slash-less spelling, which is what actually
 * prevents it. This is the assertion that says so out loud, and it fails in
 * seconds on a laptop instead of in twenty minutes across eight CI jobs.
 */
describe('the repository', () => {
  it('tracks nothing called node_modules', () => {
    // `git ls-files` lists the INDEX, so this sees a committed symlink even
    // though the working tree has a real (ignored) directory in the same place.
    const tracked = execFileSync('git', ['ls-files', '*node_modules*'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.length > 0);

    expect(tracked).toEqual([]);
  });
});
