import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * A fine-grained highlighter, not `shiki`'s full bundle.
 *
 * The full bundle carries every grammar and theme Shiki ships (megabytes). We
 * load five grammars and two themes explicitly. This runs only on the server —
 * `CodeBlock` is an async Server Component — so none of it reaches the browser,
 * but it still governs cold-start time and server memory.
 *
 * The JavaScript RegExp engine replaces the Oniguruma WASM binary entirely:
 * ~0 bytes of WASM to load and no `onig.wasm` asset to serve. `forgiving: true`
 * downgrades the handful of grammar patterns the JS engine cannot express into
 * no-ops rather than throwing — the affected patterns are edge-case shell
 * constructs, and the alternative is shipping WASM for them.
 */

export const CODE_LANGS = ['javascript', 'typescript', 'python', 'json', 'bash'] as const;
export type CodeLang = (typeof CODE_LANGS)[number];

/** Module-level cache. Next keeps the module alive across requests in one worker. */
let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ],
    langs: [
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/bash.mjs'),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

/** Line height (21px) + vertical padding (2 × 16px) — must match code-block.css. */
const LINE_HEIGHT_PX = 21;
const BLOCK_PADDING_PX = 16;

/**
 * The exact rendered height, computed on the server.
 *
 * The reveal animates a clip-path over a container that must already be its
 * final size. If the container grows as the reveal runs, every element below it
 * moves and the page books a layout shift.
 */
export function codeBlockMinHeight(code: string): number {
  const lines = code.replace(/\n$/, '').split('\n').length;
  return lines * LINE_HEIGHT_PX + BLOCK_PADDING_PX * 2;
}
