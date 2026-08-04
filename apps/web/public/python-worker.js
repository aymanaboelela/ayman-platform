/*
 * The Python runner for /playground.
 *
 * A MODULE worker, and a real file under /public rather than a blob URL.
 *
 * Module, because Pyodide 314 rejects anything else — a classic worker gets
 * "Classic web workers are not supported" straight back from `loadPyodide`,
 * with no hint about which of the twelve things that could mean it is. That is
 * measured, not assumed: the first version of this file used `importScripts`
 * and got exactly that string.
 *
 * A real file rather than a blob, because `worker-src 'self'` then covers it
 * with no `blob:` exception, and the static `import` below is a plain
 * `script-src 'self'` fetch.
 *
 * ## The security ordering, which is the whole design
 *
 * Pyodide MUST be able to fetch while it boots — it pulls a 9.6 MB wasm module
 * and a 2.5 MB stdlib over HTTP. The JS runner deletes `fetch` before any user
 * code compiles; this one cannot do that first, because there would be no
 * interpreter to run.
 *
 * So the order is: boot the interpreter, and only THEN delete every network
 * entry point — before a single line of student code is evaluated. The window
 * in which this worker can reach the network contains our own code and nothing
 * else. That matters because a worker inherits the page's origin: a snippet
 * copied off the internet doing `fetch('/api/…', {credentials:'include'})`
 * would otherwise run as the signed-in student.
 *
 * The cost is that `import numpy` fails. That is correct — no packages are
 * shipped, and an import that silently downloaded one would be the exact
 * network access this closes.
 *
 * ## Why there is no timeout in here
 *
 * A worker cannot interrupt its own synchronous loop, and Python running
 * inside wasm is synchronous. `while True: pass` is stopped by the MAIN thread
 * calling `terminate()` — see `lib/run-python.ts`. Nothing here can help.
 */

import { loadPyodide } from '/pyodide/pyodide.mjs';

let pyodide = null;

async function boot() {
  if (pyodide) return pyodide;

  pyodide = await loadPyodide({ indexURL: '/pyodide/' });

  // Everything above this line is ours. Everything below runs student code.
  self.fetch = undefined;
  self.XMLHttpRequest = undefined;
  self.WebSocket = undefined;
  self.EventSource = undefined;
  // Not reachable in a module worker anyway; deleted so the list stays the
  // same shape as the JavaScript runner's and nobody has to remember why one
  // of them is shorter.
  self.importScripts = undefined;

  return pyodide;
}

self.onmessage = async (event) => {
  const { id, code } = event.data;

  let py;
  try {
    py = await boot();
  } catch (error) {
    self.postMessage({ id, out: [], error: String((error && error.message) || error), fatal: true });
    return;
  }

  const out = [];
  // Both streams are captured rather than only stdout: a traceback Python
  // prints itself goes to stderr, and dropping it would leave a student with a
  // program that "did nothing" instead of one that told them what went wrong.
  py.setStdout({ batched: (line) => out.push(line) });
  py.setStderr({ batched: (line) => out.push(line) });

  try {
    await py.runPythonAsync(code);
    self.postMessage({ id, out, error: null });
  } catch (error) {
    // Pyodide puts the real Python traceback in `message`. It is the single
    // most useful thing a beginner can be shown, so it is passed through
    // whole rather than summarised into "an error occurred".
    self.postMessage({ id, out, error: String((error && error.message) || error) });
  }
};
