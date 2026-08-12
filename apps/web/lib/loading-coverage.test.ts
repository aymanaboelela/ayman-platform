import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = join(import.meta.dirname, '..', 'app');

/**
 * `app/dev/*` is the design-system playground, not a product route.
 *
 * `app/(admin)/*` is out of scope for this pass: Plan 7's motion/atmosphere
 * work (this file) and its security-hardening half run concurrently against
 * the same branch, split by file ownership, and `(admin)/**` is the
 * security half's territory. Loading-state coverage for the admin surface
 * belongs to whichever pass next touches that route group.
 */
const EXEMPT = /(^|[\\/])dev([\\/]|$)|(^|[\\/])\(admin\)([\\/]|$)/;

/** Route groups `(x)` and parallel/intercepted segments are still real segments. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_') || entry === 'api' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    out.push(full);
    walk(full, out);
  }
  return out;
}

const segments = [APP_DIR, ...walk(APP_DIR)];
const has = (dir: string, file: RegExp) => readdirSync(dir).some((f) => file.test(f));
const rel = (dir: string) => relative(APP_DIR, dir) || '.';

const withPage = segments.filter((d) => has(d, /^page\.tsx?$/) && !EXEMPT.test(rel(d)));
const withLoading = segments.filter((d) => has(d, /^loading\.tsx?$/));

describe('loading.tsx coverage', () => {
  it('gives every product route a skeleton', () => {
    const missing = withPage.filter((d) => !has(d, /^loading\.tsx?$/)).map(rel);
    expect(missing, `route segments with no loading.tsx: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps every loading.tsx a Server Component', () => {
    // A client loading.tsx is not in the SSR'd HTML, which is the entire point
    // of having one — the skeleton would appear only after the JS bundle lands.
    const clientish = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(clientish).toEqual([]);
  });

  it('never reads request state in a layout that sits beside a loading.tsx', () => {
    // loading.tsx wraps page.js, not-found.js and NESTED layout.js — but NOT the
    // layout.js in its own segment. A cookies()/headers()/draftMode() call in
    // that same-segment layout blocks the shell, so the skeleton never renders.
    // This is the #1 reason a loading.tsx "doesn't work".
    const offenders: string[] = [];
    for (const dir of withLoading) {
      const layout = readdirSync(dir).find((f) => /^layout\.tsx?$/.test(f));
      if (!layout) continue;
      const source = readFileSync(join(dir, layout), 'utf8');
      if (/\b(cookies|headers|draftMode|connection)\s*\(/.test(source)) {
        offenders.push(`${rel(dir)}/${layout}`);
      }
    }
    expect(
      offenders,
      `these same-segment layouts block their own loading.tsx: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('never imports next/headers from a loading.tsx', () => {
    const offenders = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => /from ['"]next\/headers['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('builds every skeleton from the shared primitives', () => {
    // Geometry parity is what makes the swap invisible. A hand-rolled div grid
    // drifts from the real component the first time its padding changes.
    //
    // `@ayman/ui` OR `@ayman/ui/...` — the subpath counts, and since the barrel
    // is now banned outright by the test below, the subpath is in practice the
    // only spelling left. What this assertion is actually about is that the
    // skeleton came from the design system at all, not which specifier reached
    // it.
    const offenders = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => !/from ['"]@ayman\/ui(\/[^'"]+)?['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('never reaches a skeleton through the @ayman/ui root barrel', () => {
    // The root `loading.tsx` sits in EVERY route's segment tree, so whatever it
    // imports becomes a client reference on effectively every route manifest in
    // the product.
    //
    // Measured on the build before this rule existed: one `import { Skeleton }
    // from '@ayman/ui'` registered the barrel's seven Radix client modules —
    // dialog, dropdown-menu, sheet, field, switch, checkbox, radio-group — on
    // 64 of 65 routes. That included `/offline`, which renders one heading and
    // one button, and `/_not-found`. About 92 KB raw / 28 KB gzip of Radix
    // internals downloaded, parsed and compiled on a mid-range Android for
    // components those pages never render.
    //
    // `@ayman/ui/components/skeleton` costs the skeleton and nothing else. This
    // is a REGRESSION GUARD, not a style rule: the barrel import is the natural
    // thing to write, editors autocomplete to it, and nothing else in the
    // toolchain notices. Tree-shaking does not save it — `transpilePackages`
    // plus the barrel's `export *` defeats it, which is why the specifier has
    // to be the control.
    const offenders = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => /from ['"]@ayman\/ui['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(
      offenders,
      `these loading.tsx files import the @ayman/ui root barrel; use a subpath such as '@ayman/ui/components/skeleton': ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
