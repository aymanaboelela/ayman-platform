/**
 * Hazard H3, made into a build failure.
 *
 * ## What breaks, and why nothing else catches it
 *
 * `packages/contracts` is `"type": "module"` and its `exports` map points at
 * `.ts` sources directly. The root barrel, `src/index.ts`, re-exports its
 * siblings EXTENSIONLESSLY (`export * from './taxonomy'`) — a convention the
 * README documents and defends, because Turbopack cannot map a `.js` specifier
 * onto a `.ts` source.
 *
 * Node's own loader has no such tolerance. The moment `apps/api` needs a
 * runtime VALUE from the root barrel, the compiled CommonJS does
 * `require("@ayman/contracts")`, Node resolves that to `src/index.ts`, treats
 * it as ESM TypeScript, and dies on the first extensionless re-export:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find module
 *       '…/packages/contracts/src/copy/ar'
 *       imported from …/packages/contracts/src/index.ts
 *
 * The application does not start. Nothing else in the repository notices:
 *
 *   · `tsc --noEmit` is happy — `moduleResolution: "Bundler"` resolves it.
 *   · Jest is happy — `@swc/jest` compiles the source and Jest's own resolver
 *     never consults Node's ESM rules.
 *   · The SWC build is happy — it emits a `require()` and never runs it.
 *
 * So the entire suite stays green while `pnpm dev` cannot boot. That is the
 * trap `player.service.ts` names in a comment; this file is the part that
 * fails the build instead of relying on the next person having read it.
 *
 * ## The rule
 *
 * A runtime value must come from an explicit SUBPATH export
 * (`@ayman/contracts/video`, `/progress`, `/quiz/mastery`), which resolves to a
 * leaf module with no extensionless re-exports of its own. The root barrel is
 * for TYPES ONLY, and types must be written as `import type` so the compiler
 * erases the statement entirely.
 *
 * Runs under tsx from the api `test` script, beside `file-signature.check.ts`.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Resolved from `cwd`, not from `import.meta.dirname` — tsx loads this file
 * through the CommonJS interop path, where that property is `undefined` and
 * `join()` throws before a single file is scanned. Both launch points are
 * accepted: the api `test` script (cwd = apps/api) and a run from the repo
 * root.
 */
const SRC = [join(process.cwd(), 'src'), join(process.cwd(), 'apps', 'api', 'src')].find((path) =>
  existsSync(path),
);

assert.ok(SRC, 'run this from apps/api or from the repository root');

/** Generated Prisma output only mentions the package inside doc comments, and
 *  it is not ours to edit. Specs never run under Node's loader. */
const SKIP = ['generated', 'node_modules'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.includes(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : [];
  });
}

/**
 * Every `import … from '@ayman/contracts'` statement — the ROOT barrel
 * exactly, not its subpaths (the closing quote is anchored, so
 * `'@ayman/contracts/video'` cannot match).
 *
 * The clause is `[^;]*?` rather than `[\s\S]*?` so a match cannot run backwards
 * across a statement boundary: an import clause never contains a semicolon, and
 * the preceding statement always ends in one. Without that guard the pattern
 * happily starts at `import { Controller } from '@nestjs/common';` on the line
 * ABOVE and swallows it, so a perfectly correct `import type` a line later gets
 * reported — which is how the first draft of this file accused seventeen
 * innocent modules.
 */
const ROOT_BARREL_IMPORT = /import\s+([^;]*?)\s+from\s+'@ayman\/contracts'/g;

const offenders: string[] = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8');

  for (const [, clause] of source.matchAll(ROOT_BARREL_IMPORT)) {
    // `import type { … }` is erased by the compiler and never reaches Node.
    // Anything else — including `import { type A }`, where the emitter cannot
    // always prove the whole clause is types — emits a live `require()`.
    if (clause.trimStart().startsWith('type ')) continue;

    offenders.push(relative(SRC, file));
  }
}

assert.deepEqual(
  offenders,
  [],
  `These files import a runtime value from the '@ayman/contracts' ROOT BARREL:\n` +
    offenders.map((file) => `  · src/${file}`).join('\n') +
    `\n\nThat compiles, type-checks and passes every test — and then the API ` +
    `cannot start, because Node resolves the barrel to a TypeScript ESM module ` +
    `whose re-exports carry no file extensions.\n\n` +
    `Fix: import the value from its explicit subpath export instead — e.g.\n` +
    `  import { MASTERY_STRONG_AT } from '@ayman/contracts/quiz/mastery';\n` +
    `adding the subpath to packages/contracts/package.json "exports" if it is ` +
    `not there yet. Keep TYPES on the root barrel, written as \`import type\`.`,
);

console.log(`contracts barrel check passed (${walk(SRC).length} files scanned)`);
