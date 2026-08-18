import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as zodModule from './zod';

/**
 * `zod.ts` may export `z` and nothing else — and the reason is a deploy, not a
 * style rule.
 *
 * `z` is a re-export, so Turbopack forwards it straight through to the `zod`
 * package and this module's compiled export table in the client bundle is
 * `e.s([])`, empty. Its module id is derived from the FILE PATH, so the same
 * number identifies it in every build, and Turbopack's client runtime keeps the
 * FIRST factory registered for an id and silently discards every later one.
 *
 * A browser holding any chunk from the previous deploy therefore has this id
 * pinned to the export-less factory. Give this file a new export, import that
 * export from a module the client evaluates, and every such browser dies at
 * module evaluation with `X is not a function` — which is exactly what
 * `partialWithoutDefaults` did to the admin course page on 2026-08-18 at 03:26.
 *
 * A NEW module is always safe, because no client can already hold an id derived
 * from a path that did not exist. So the fix for "I need a helper next to `z`"
 * is a new file — `partial.ts` is the worked example — and never a second
 * export here.
 *
 * Asserted twice on purpose. The runtime check is what actually matters and
 * cannot be fooled by formatting; the source check names the offending line, so
 * whoever trips this reads the rule where they broke it rather than a diff of
 * two arrays.
 */
describe('the zod indirection module', () => {
  it('exports z and nothing else at runtime', () => {
    expect(Object.keys(zodModule)).toEqual(['z']);
  });

  it('declares no other export in its source', () => {
    const source = readFileSync(join(import.meta.dirname, 'zod.ts'), 'utf8');
    const declarations = [...source.matchAll(/^export\s+(?!type\b)(?!\{ z \};$).*/gm)].map(
      (match) => match[0],
    );

    expect(
      declarations,
      `zod.ts must export only 'z' — put this in its own module instead: ${declarations.join(' / ')}`,
    ).toEqual([]);
  });
});
