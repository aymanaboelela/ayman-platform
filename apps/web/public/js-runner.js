/*
 * The JavaScript playground's evaluator, as a REAL same-origin worker script.
 *
 * ## Why this is a file and not a blob any more
 *
 * `lib/run-code.ts` used to build this source as a template string and start it
 * from a `blob:` URL. That is the usual recipe and it has one property nobody
 * notices until a CSP is enforced: a worker created from a `blob:` (or `data:`)
 * URL INHERITS the creating document's policy. The document's `script-src` is
 * `'self' 'unsafe-inline' 'wasm-unsafe-eval'` — `'wasm-unsafe-eval'` chosen
 * deliberately over `'unsafe-eval'` so Pyodide can compile WebAssembly without
 * re-opening `eval` for every script on every page.
 *
 * So `new Function` inside the worker threw, and «شغّل» on the JavaScript tab
 * printed the CSP error instead of the student's output. In production only:
 * `buildPublicCsp` adds `'unsafe-eval'` when `dev`, which is exactly the shape
 * of bug that passes every local check and ships broken.
 *
 * A worker started from a same-origin URL gets its policy from THIS response's
 * own headers instead — see the `/js-runner.js` case in `proxy.ts`, which
 * serves it `script-src 'unsafe-eval'` and `default-src 'none'`. The permission
 * to evaluate a string is therefore confined to this one thread, and the page
 * that owns it keeps a policy with no `unsafe-eval` at all.
 *
 * ## What contains the code, which is the part that actually matters
 *
 * Unchanged from the blob version, and the reasoning is the same:
 *
 * - **No DOM, no app state.** A worker has neither, so nothing on the page can
 *   be read or altered by the snippet.
 * - **No network.** A same-origin worker can still reach `/api/…` with the
 *   signed-in student's cookies, so the five entry points are deleted before
 *   any user code is compiled — a snippet copied off the internet cannot
 *   quietly call the API with the reader's session.
 * - **Bounded.** The owner terminates a runaway loop; the tab never freezes.
 * - **Disposable.** A fresh worker per run, torn down on every exit path.
 *
 * ⚠️ The deletions on the first line must stay FIRST. They run at worker
 * startup, before any message can arrive, which is what makes it impossible for
 * a snippet to grab a reference before they are gone.
 */
self.fetch = undefined;
self.XMLHttpRequest = undefined;
self.importScripts = undefined;
self.WebSocket = undefined;
self.EventSource = undefined;

self.onmessage = function (ev) {
  var out = [];

  var show = function (v) {
    try {
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    } catch (_) {
      return String(v);
    }
  };

  var push = function (prefix, args) {
    out.push(prefix + [].map.call(args, show).join(' '));
  };

  // The student's `console` is a local object, not the worker's own — so
  // `console.log` collects output to post back rather than writing to a devtools
  // panel the playground cannot read.
  var console = {
    log: function () {
      push('', arguments);
    },
    info: function () {
      push('', arguments);
    },
    warn: function () {
      push('⚠ ', arguments);
    },
    error: function () {
      push('⛔ ', arguments);
    },
  };

  try {
    new Function('console', ev.data)(console);
    self.postMessage({ out: out, error: null });
  } catch (err) {
    // Output collected BEFORE the throw is still posted: a snippet that prints
    // three lines and then fails should show all three and the error.
    self.postMessage({ out: out, error: String((err && err.message) || err) });
  }
};
