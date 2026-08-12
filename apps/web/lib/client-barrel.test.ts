import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What a `'use client'` file is allowed to reach.
 *
 * `loading-coverage.test.ts` guards one specific version of this — no root
 * barrel from a `loading.tsx` — because that was the case with a measurement
 * attached. This file generalises the same idea to the whole client graph, and
 * adds the rule the specifier alone cannot express: a component mounted in a
 * LAYOUT may not drag Zod onto every route with it.
 *
 * Both assertions are static reads of the source tree. No bundler runs here,
 * which is the point: the failure they guard against is invisible until you
 * build for production and diff two chunk manifests, and nobody does that on a
 * one-line import change.
 */

const WEB = resolve(import.meta.dirname, '..');
const CONTRACTS_SRC = resolve(WEB, '..', '..', 'packages', 'contracts', 'src');

/**
 * `import type { … }` and `export type { … }` are ERASED — they name a module
 * without loading one, so they cannot put a byte in a bundle. `import { type X
 * }` (the inline modifier) is elided too when every specifier carries it, but
 * only then, so the sweep normalises that shape to the outer `import type` and
 * this pattern only has to understand the outer one.
 *
 * `import('…')` is deliberately NOT matched. A dynamic import is the whole
 * mechanism the second rule below exists to reward: it produces an async chunk
 * that is not in the route's client reference manifest and is not preloaded.
 */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s*'([^']+)'|^\s*import\s+'([^']+)'/gm;

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

function isClientModule(file: string): boolean {
  return /^['"]use client['"];/.test(read(file).trimStart());
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec|e2e)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** `@/x` and `./x` only — a package specifier is not a file in this tree. */
function resolveLocal(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(WEB, specifier.slice(2))
    : specifier.startsWith('.')
      ? join(dirname(from), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function staticImports(file: string): string[] {
  const specifiers: string[] = [];
  for (const match of read(file).matchAll(STATIC_IMPORT)) {
    if (match[1]) continue; // `import type` — erased
    const specifier = match[2] ?? match[3];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

const APP_SOURCES = [...walkFiles(join(WEB, 'app')), ...walkFiles(join(WEB, 'components')), ...walkFiles(join(WEB, 'lib'))];

describe('the @ayman root barrels', () => {
  it('are never imported by a client component', () => {
    /*
     * The measurement behind this: one `import { Skeleton } from '@ayman/ui'`
     * in the root `loading.tsx` registered the barrel's seven Radix client
     * modules on 64 of 65 routes, and one `from '@ayman/contracts'` in the
     * assistant widget did the same with 539 KB raw / 128 KB gzip of schemas,
     * libphonenumber's 245-country table and the whole Arabic copy table —
     * onto the landing page, the login form and a running graded exam.
     *
     * Tree-shaking does not save this. `transpilePackages` plus a barrel that
     * is almost entirely `export *` defeats it, which is why the SPECIFIER has
     * to be the control. Both packages carry a full exports map; every symbol
     * either barrel re-exports is reachable through a subpath.
     *
     * Server Components are exempt and stay exempt — they cost nothing in the
     * client bundle, and converting them is churn for no byte.
     */
    const offenders = APP_SOURCES.filter(isClientModule)
      .filter((file) => staticImports(file).some((s) => s === '@ayman/ui' || s === '@ayman/contracts'))
      .map((file) => relative(WEB, file));

    expect(
      offenders,
      `these client components import a root barrel; use a subpath such as '@ayman/ui/components/button' or '@ayman/contracts/copy': ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

/** Every contracts subpath whose module actually constructs Zod schemas. */
function zodBearingSubpaths(): Set<string> {
  const found = new Set<string>();
  for (const file of walkFiles(CONTRACTS_SRC)) {
    if (/from '(?:\.\.\/)*(?:\.\/)?zod'|@ayman\/contracts\/zod|from 'zod'/.test(read(file))) {
      found.add(`@ayman/contracts/${relative(CONTRACTS_SRC, file).replace(/\.ts$/, '').replaceAll('\\', '/')}`);
    }
  }
  found.add('zod');
  found.add('@ayman/contracts/zod');
  return found;
}

describe('Zod on the universal path', () => {
  it('is not statically reachable from anything a layout mounts', () => {
    /*
     * A layout sits in every route's segment tree, so a client component it
     * mounts is a client reference on every route under it — listed in that
     * route's `page_client-reference-manifest.js`, preloaded from a `<script>`
     * in the `<head>`, parsed before the page is interactive. Zod is 62 KB
     * gzip, and after the barrels were swept it was STILL landing on 21
     * prerendered routes, because the assistant widget genuinely needs schemas
     * to validate three API responses. A subpath cannot fix that; only moving
     * the validating code behind a `import()` can.
     *
     * So the rule is about the graph, not the specifier: schemas belong behind
     * a dynamic boundary that a student who never opens the thing never
     * crosses. `assistant-session.ts`, `assistant-catalog.ts` and
     * `notification-feed.ts` are what that looks like — each one a fetch plus
     * its schema, reached by `await import()` at the moment it is needed.
     *
     * Deliberately NOT a rule about client components in general: the quiz
     * runner, the onboarding wizard and the admin forms all validate, all pay
     * for Zod, and all pay for it on ONE route.
     */
    const zodSubpaths = zodBearingSubpaths();
    const layouts = APP_SOURCES.filter((file) => /(^|[\\/])layout\.tsx$/.test(file));
    const offenders: string[] = [];

    for (const layout of layouts) {
      const seen = new Set<string>([layout]);
      const inClient = new Set<string>();
      const queue = [layout];

      while (queue.length > 0) {
        const current = queue.pop()!;
        const clientHere = inClient.has(current) || isClientModule(current);
        for (const specifier of staticImports(current)) {
          if (clientHere && zodSubpaths.has(specifier)) {
            offenders.push(`${relative(WEB, layout)} → ${relative(WEB, current)} → ${specifier}`);
          }
          const target = resolveLocal(specifier, current);
          if (!target) continue;
          // A module reached from client code is client code, even if it was
          // already visited on the server side of the same layout's graph.
          if (clientHere && !inClient.has(target)) {
            inClient.add(target);
            queue.push(target);
          } else if (!seen.has(target)) {
            seen.add(target);
            queue.push(target);
          }
        }
      }
    }

    const unique = [...new Set(offenders)].sort();
    expect(
      unique,
      `Zod reaches the client bundle of every route under these layouts. Move the schema and the fetch that uses it into their own module and reach it with \`await import()\`: ${unique.join(' | ')}`,
    ).toEqual([]);
  });
});
