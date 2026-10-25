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
/*
 * Turbopack 16.4's compiled output for `zod.ts`, verbatim from
 * `.next/static/chunks` (2026-10-25, Next 16.4.3, zod 4.6.7). One factory is
 * registered under TWO ids — 237145 is the module, 108691 the facade that
 * carries its `z` re-export — and `e.s` names the id it fills. A replay must
 * keep that shape: register 237145 alone and 108691 never gets a factory, so
 * every page that imports `z` (the login form first) breaks before this test
 * can reach the course form.
 *
 * Re-capture after a Next or zod bump: in `.next/static/chunks`, find
 * `237145,108691,e=>{` and copy the factory body. `ZOD_PACKAGE_ID` is the
 * `e.i(…)` it opens with — minted from zod's path under `node_modules/.pnpm`,
 * so it moves whenever zod's version does (817422 on 4.4.3).
 */
const ZOD_IDS = '237145,108691';
const ZOD_PACKAGE_ID = 377698;
const ZOD_HEAD = `var t=e.i(${ZOD_PACKAGE_ID});e.s(["z",0,t],108691);var t=t,r=t;"window"in globalThis&&r.config({jitless:!0}),`;

const STALE_BUILDS = [
  {
    label: 'the build before the helper existed',
    body: `${ZOD_HEAD}e.s([],237145)`,
  },
  {
    label: 'the build that exported the helper from zod.ts',
    body:
      ZOD_HEAD +
      'e.s(["partialWithoutDefaults",0,function(e){return Object.fromEntries(' +
      'Object.entries(e).map(([e,n])=>{let o=n instanceof r.ZodDefault?n.def.innerType:n;' +
      'return[e,r.optional(o)]}))}],237145)',
  },
] as const;

for (const { label, body } of STALE_BUILDS) {
  test(`a tab holding ${label} still opens the course form`, async ({ page }) => {
    await page.addInitScript(
      `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["static/chunks/stale-build.js",${ZOD_IDS},` +
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
