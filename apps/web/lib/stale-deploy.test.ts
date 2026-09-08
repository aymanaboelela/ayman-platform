import { describe, expect, it } from 'vitest';
import { isModuleEvaluationError, isStaleChunkError, isStaleDeployError } from './stale-deploy';

/**
 * The predicate decides two behaviours that are invisible when it is wrong:
 * whether «حاول تاني» reloads on the first press instead of the second, and
 * whether a deploy artefact is filed as a fault on `/admin/errors`. Neither
 * failure announces itself, so the message it matches is pinned here.
 */
describe('isStaleDeployError', () => {
  it('matches the real production message, verbatim', () => {
    // Copied byte-for-byte from `/admin/errors` row 17 — including the trailing
    // space and newline before the docs link, which is what Next actually emits.
    const actual = new Error(
      'Server Action "70674c275044efa878d1f18e7c30cc06df93a1365f" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );

    expect(isStaleDeployError(actual)).toBe(true);
  });

  it('does not match ordinary failures', () => {
    // A page that legitimately threw must still reach the error log — matching
    // too broadly would silently empty the screen this was found on.
    for (const message of [
      'An error occurred in the Server Components render.',
      'Unable to initialize WebGL.',
      'fetch failed',
      'Server Action failed', // similar words, different fault: this one is real
      '',
    ]) {
      expect(isStaleDeployError(new Error(message))).toBe(false);
    }
  });
});

/**
 * The stack this matches is the one production actually produced, so it is
 * pinned here verbatim rather than paraphrased. Getting it wrong is silent in
 * both directions: too narrow and «حاول تاني» goes back to needing two presses,
 * too broad and an ordinary client error hard-reloads the page under someone.
 */
describe('isModuleEvaluationError', () => {
  it('matches the real production stack, verbatim', () => {
    // `/admin/errors`, 2026-08-18 03:26, `/admin/courses/{id}`.
    const actual = new Error('(0 , t.partialWithoutDefaults) is not a function');
    actual.stack = [
      'TypeError: (0 , t.partialWithoutDefaults) is not a function',
      '    at module evaluation (https://aymanaboelela.com/_next/static/chunks/1n-wn64nqsgu1.js:1:37069)',
      '    at W (https://aymanaboelela.com/_next/static/chunks/turbopack-2mmb386ihfj61.js:1:7647)',
      '    at B (https://aymanaboelela.com/_next/static/chunks/turbopack-2mmb386ihfj61.js:1:7188)',
    ].join('\n');

    expect(isModuleEvaluationError(actual)).toBe(true);
  });

  it('does not match an ordinary client throw', () => {
    // A component that threw during render runs through app chunks, never
    // through a factory Turbopack named `module evaluation`.
    const ordinary = new Error('Cannot read properties of undefined');
    ordinary.stack = [
      'TypeError: Cannot read properties of undefined',
      '    at LessonPanel (https://aymanaboelela.com/_next/static/chunks/0r-9dd_lrviuf.js:1:5774)',
      '    at renderWithHooks (https://aymanaboelela.com/_next/static/chunks/2y26wo377ddui.js:1:9)',
    ].join('\n');

    expect(isModuleEvaluationError(ordinary)).toBe(false);
  });

  it('does not match an error with no stack at all', () => {
    // Server errors reach the boundary as a bare message plus a digest.
    const server = new Error('An error occurred in the Server Components render.');
    server.stack = undefined;

    expect(isModuleEvaluationError(server)).toBe(false);
  });
});

/**
 * The third deploy shape, and the one the service worker's new per-build cache
 * version makes reachable: a chunk that is not on the server any more and is no
 * longer on the device either.
 *
 * Same two silent failure directions as the predicates above. Too narrow and a
 * student sits on an error screen for a file a reload would have fetched; too
 * broad and an ordinary failure hard-reloads the page under someone.
 */
describe('isStaleChunkError', () => {
  /** Turbopack's own construction, from this app's shipped `turbopack-*.js`:
   *  `Error(\`Failed to load chunk ${url} ${source}${cause}\`)` then
   *  `err.name = 'ChunkLoadError'`. */
  function chunkLoadError(message: string): Error {
    const error = new Error(message);
    error.name = 'ChunkLoadError';
    return error;
  }

  it('matches on the name, whatever the message says', () => {
    // Every part of the message varies — the URL, the source phrase ("from
    // module X" / "as a runtime dependency of chunk Y" / "from an HMR update"),
    // and the appended cause. The name does not.
    for (const message of [
      'Failed to load chunk /_next/static/chunks/1n-wn64nqsgu1.js from module 44811',
      'Failed to load chunk static/chunks/0r.js as a runtime dependency of chunk 12: TypeError: Failed to fetch',
      '',
    ]) {
      expect(isStaleChunkError(chunkLoadError(message))).toBe(true);
    }
  });

  it('does not match an ordinary error that merely mentions loading a chunk', () => {
    // Matching the message instead would fire on an app-level sentence, and
    // the consequence is a page that reloads itself under someone.
    for (const message of [
      'Failed to load chunk /_next/static/chunks/1n-wn64nqsgu1.js from module 44811',
      'Failed to load the lesson',
      'Failed to fetch',
    ]) {
      expect(isStaleChunkError(new Error(message))).toBe(false);
    }
  });

  it('does not match the other two deploy shapes', () => {
    // The three predicates drive different recoveries; overlapping them would
    // make which one wins depend on the order of the `if`s in the hook.
    const staleAction = new Error(
      'Server Action "70674c275044efa878d1f18e7c30cc06df93a1365f" was not found on the server.',
    );
    expect(isStaleChunkError(staleAction)).toBe(false);

    const moduleEval = new Error('(0 , t.partialWithoutDefaults) is not a function');
    moduleEval.stack = [
      '    at module evaluation (https://aymanaboelela.com/_next/static/chunks/1n.js:1:1)',
      '    at W (https://aymanaboelela.com/_next/static/chunks/turbopack-2mmb.js:1:1)',
    ].join('\n');
    expect(isStaleChunkError(moduleEval)).toBe(false);
  });
});
