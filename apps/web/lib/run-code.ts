'use client';

import { copy } from '@ayman/contracts/copy';
import { JS_RUNNER_PATH } from './js-runner';

const c = copy.landing;

/** Runaway loops are terminated at this point rather than freezing the tab. */
const TIMEOUT_MS = 2500;

export type RunResult = {
  out: string[];
  error: string | null;
};

/**
 * Runs student code inside a throwaway Web Worker.
 *
 * The evaluator itself is `public/js-runner.js`, and the containment it
 * provides — no DOM, no app state, no network, terminated on a runaway loop,
 * disposed on every exit path — is documented there.
 *
 * ## Why the source is a FILE and not a blob
 *
 * It was a template string started from `URL.createObjectURL(new Blob(…))`,
 * which is the usual recipe and has one property that only surfaces once a CSP
 * is enforced: a worker created from a `blob:` URL inherits the creating
 * DOCUMENT's policy. This app's `script-src` is `'self' 'unsafe-inline'
 * 'wasm-unsafe-eval'` — the narrow wasm keyword on purpose, so Pyodide can
 * compile WebAssembly while `eval` and `new Function` stay shut everywhere.
 *
 * So the worker could not compile the student's snippet, and «شغّل» printed
 * the CSP error into the output panel instead of their output. In production
 * only: `buildPublicCsp` adds `'unsafe-eval'` under `dev`, so it worked on
 * every machine it was written on.
 *
 * A worker started from a same-origin URL takes its policy from that script's
 * own response, which `proxy.ts` answers with `default-src 'none'; script-src
 * 'unsafe-eval'`. The capability is confined to this one thread; the page keeps
 * a policy that has no `unsafe-eval` in it at all.
 *
 * ⚠️ The path comes from `JS_RUNNER_PATH`, shared with the proxy. Hard-coding
 * it in both places is how the worker ends up on a URL that does not carry the
 * policy — which fails back to exactly the bug above, silently.
 */
export function runCode(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    let worker: Worker | null = null;

    const done = (result: RunResult) => {
      if (worker) worker.terminate();
      resolve(result);
    };

    try {
      worker = new Worker(JS_RUNNER_PATH);

      const timer = setTimeout(() => done({ out: [], error: c.playTimeout }), TIMEOUT_MS);

      worker.onmessage = (ev: MessageEvent<RunResult>) => {
        clearTimeout(timer);
        done(ev.data);
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        done({ out: [], error: String(ev.message || c.playWorkerError) });
      };

      worker.postMessage(code);
    } catch {
      // Workers blocked outright (some embedded webviews, an extension, a
      // policy stricter than ours). The lab degrades to "cannot run" rather
      // than throwing.
      done({ out: [], error: c.playUnavailable });
    }
  });
}
