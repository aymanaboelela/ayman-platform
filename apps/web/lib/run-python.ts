'use client';

import { copy } from '@ayman/contracts/copy';
import type { RunResult } from './run-code';

const c = copy.playground;

/**
 * Runaway loops are terminated at this point. Longer than the JavaScript
 * runner's 2500ms on purpose: the first `runPythonAsync` after boot pays for
 * the stdlib being unzipped, and killing a student's first correct program
 * because the interpreter was still warming up is worse than waiting.
 */
const TIMEOUT_MS = 8000;

/**
 * The Python side of the playground.
 *
 * ## One persistent worker, not one per run
 *
 * Booting Pyodide costs a 13.5 MB download and a couple of seconds of wasm
 * instantiation. Throwing the worker away after every run — which is what the
 * JavaScript runner does, cheaply — would make every single press of Run pay
 * that again. So the worker is kept, and the isolation it provides is
 * structural rather than per-run: no DOM, no app state, and every network
 * entry point deleted before the first line of student code (see
 * `public/python-worker.js` for why the ordering is the way round it is).
 *
 * The one thing a persistent worker gives up is state isolation BETWEEN runs:
 * a variable defined in one run is still defined in the next. That is how
 * every notebook behaves and it is what a student trying things out expects;
 * `resetPython()` exists for when they want a clean slate.
 *
 * ## Termination is the only way to stop a loop
 *
 * `while True: pass` is synchronous inside wasm and cannot be interrupted from
 * inside the worker. The main thread terminates it, which necessarily destroys
 * the interpreter with it — so the next run re-boots. That re-boot is fast:
 * the browser serves the wasm and the stdlib from its HTTP cache, so it is an
 * instantiation, not a second 13.5 MB download.
 */

let worker: Worker | null = null;
let nextId = 1;

/** `true` once the interpreter has booted — the UI stops showing "loading". */
let booted = false;

export function isPythonBooted(): boolean {
  return booted;
}

/** Drops the interpreter. The next `runPython` boots a clean one. */
export function resetPython(): void {
  if (worker) worker.terminate();
  worker = null;
  booted = false;
}

export function runPython(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: RunResult, killWorker: boolean) => {
      if (settled) return;
      settled = true;
      if (killWorker) resetPython();
      resolve(result);
    };

    try {
      if (!worker) {
        // `{ type: 'module' }` is required, not stylistic: Pyodide 314 refuses
        // a classic worker outright — see `public/python-worker.js`.
        worker = new Worker('/python-worker.js', { type: 'module' });
        // A worker-level error (the script failing to load, wasm refused by a
        // policy) never reaches the per-message handler, so it is caught here
        // or it is not caught at all.
        worker.onerror = () => finish({ out: [], error: c.pythonUnavailable }, true);
      }

      const id = nextId++;
      const timer = setTimeout(() => {
        // Terminate, do not just report: the loop is still spinning inside
        // wasm and would keep a core busy for as long as the tab is open.
        finish({ out: [], error: c.timeout }, true);
      }, TIMEOUT_MS);

      const onMessage = (event: MessageEvent<RunResult & { id: number; fatal?: boolean }>) => {
        if (event.data.id !== id) return;
        clearTimeout(timer);
        worker?.removeEventListener('message', onMessage);
        booted = !event.data.fatal;
        finish({ out: event.data.out, error: event.data.error }, Boolean(event.data.fatal));
      };

      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, code });
    } catch {
      // Workers blocked outright (a strict policy, some embedded webviews).
      finish({ out: [], error: c.pythonUnavailable }, true);
    }
  });
}
