import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No VALUE import between contracts files by relative path.
 *
 * The API runs these sources directly under Node, which resolves ESM
 * specifiers literally: `from './settings'` names a file without its `.ts`
 * and throws ERR_MODULE_NOT_FOUND, while `@ayman/contracts/admin/settings`
 * goes through the package `exports` map and lands on the `.ts`. The bundler
 * and the test runner both resolve the bare form, so nothing caught it — and
 * `tenant-branding.ts` importing `./settings` made `seed.js` die on EVERY
 * stack's boot from 2026-10-11 on (found 2026-10-30 when a new teacher's stack
 * came up with no stages, subjects or governorates at all).
 *
 * `import type` is erased before Node sees it, so it may stay relative.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name) ? [full] : [];
  });
}

describe('contracts runtime imports', () => {
  it('never value-imports a sibling by relative path', () => {
    const root = path.resolve(__dirname);
    const offenders = sources(root).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /^import\s+(?!type\b)[^;]*\sfrom\s+'\.\.?\//.test(line))
        .map((line) => `${path.relative(root, file)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
