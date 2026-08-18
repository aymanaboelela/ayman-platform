import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures';

/**
 * A tab that outlived a deploy must still be able to open the course form.
 *
 * `packages/contracts/src/zod.ts` compiles to a client module whose id — 237145
 * — Turbopack derives from the FILE PATH, so it is the same number in every
 * build, and the client runtime keeps the FIRST factory registered for an id
 * and silently drops every later one. That is how the admin course page died on
 * 2026-08-18 at 03:26 with `(0 , t.partialWithoutDefaults) is not a function`:
 * the helper had just been added as this module's first-ever export, and every
 * browser still holding a chunk from the previous build had the id pinned to
 * the export-less factory.
 *
 * Both factories below are the real compiled output of the two builds either
 * side of that deploy, replayed into a tab loading the CURRENT one.
 *
 * ⚠️ Each case asserts that the stale factory RAN. Without that, a rename of
 * `zod.ts` (or a change to how Turbopack mints ids) would leave these tests
 * registering an id nothing imports — green, and testing nothing at all.
 */
const STALE_BUILDS = [
  {
    label: 'the build before the helper existed',
    body: 'var t=e.i(817422);"window" in globalThis&&t.z.config({jitless:!0}),e.s([])',
  },
  {
    label: 'the build that exported the helper from zod.ts',
    body:
      'var t=e.i(817422);"window" in globalThis&&t.z.config({jitless:!0}),' +
      'e.s(["partialWithoutDefaults",0,function(e){return Object.fromEntries(' +
      'Object.entries(e).map(([e,r])=>{let n=r instanceof t.z.ZodDefault?r.def.innerType:r;' +
      'return[e,t.z.optional(n)]}))}])',
  },
] as const;

for (const { label, body } of STALE_BUILDS) {
  test(`a tab holding ${label} still opens the course form`, async ({ page }) => {
    await page.addInitScript(
      `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["static/chunks/stale-build.js",237145,` +
        `function(e){"use strict";globalThis.__staleZodRan=true;${body}}]);`,
    );

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`);
    });

    await loginAsAdmin(page);
    await page.goto('/admin/courses/new');
    await page.waitForLoadState('networkidle');

    expect(
      await page.evaluate(() => (globalThis as unknown as { __staleZodRan?: boolean }).__staleZodRan),
      'the stale registration never won — module 237145 is no longer zod.ts, so this test proves nothing',
    ).toBe(true);
    expect(errors.join('\n')).not.toContain('is not a function');
    await expect(page).toHaveTitle(/كورس جديد/);
  });
}
