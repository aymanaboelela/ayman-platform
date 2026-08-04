import { createRequire } from 'node:module';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Copies the Pyodide RUNTIME into `public/pyodide/` before a build or a dev
 * server starts.
 *
 * ## Why a copy step and not a committed folder
 *
 * These five files are 13.5 MB. Committing them would put a binary blob that
 * size into every clone and every diff, for a dependency npm already versions
 * — and pinning it in `package.json` while ALSO carrying a copy in git is two
 * sources of truth for the same artefact. `public/pyodide/` is gitignored and
 * regenerated; the version in `package.json` is the only thing to update.
 *
 * ## Why these five and not the whole package
 *
 * The package is 13.9 MB and includes source maps, TypeScript declarations and
 * two demo HTML pages that would all be served publicly. This is the minimum
 * that actually boots an interpreter:
 *
 *   pyodide.mjs        the loader the worker imports. The ESM build, not the
 *                      classic one: Pyodide 314 refuses a classic worker
 *                      outright with "Classic web workers are not supported",
 *                      so `public/python-worker.js` is a MODULE worker and
 *                      `importScripts` is not in the picture at all.
 *   pyodide.asm.mjs    the Emscripten glue
 *   pyodide.asm.wasm   the interpreter itself, 9.6 MB
 *   python_stdlib.zip  the standard library, 2.5 MB
 *   pyodide-lock.json  the package index; Pyodide reads it during boot even
 *                      when nothing is ever installed from it
 *
 * ## Why it is safe to re-run
 *
 * `cp` with `force` overwrites, and the whole step is skipped when the target
 * already holds the wasm — so `pnpm dev` does not re-copy 13 MB on every
 * restart. Delete `public/pyodide/` to force it.
 */

const require = createRequire(import.meta.url);
const FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const from = dirname(require.resolve('pyodide/package.json'));
const to = join(process.cwd(), 'public', 'pyodide');

const already = await stat(join(to, 'pyodide.asm.wasm')).catch(() => null);
if (already) {
  console.log('pyodide: already vendored, skipping');
  process.exit(0);
}

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await cp(join(from, file), join(to, file), { force: true });
}
console.log(`pyodide: vendored ${FILES.length} files into public/pyodide`);
