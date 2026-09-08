/**
 * "This tab is older than the server it is talking to."
 *
 * ## The failure
 *
 * Next gives every Server Action a build-scoped id and ships it inside the
 * client bundle. A deploy mints new ids. So a tab that was open across a deploy
 * still holds the OLD id, and the first action it fires — a form submit, a
 * delete, an admin save — is answered by a server that has never heard of it:
 *
 *   Server Action "70674c275044efa878d1f18e7c30cc06df93a1365f" was not found
 *   on the server.
 *
 * Recorded once on production against `/admin/courses/{id}` (`/admin/errors`
 * row 17) — an editor with the course builder open while `main` deployed, which
 * on this project happens several times an evening.
 *
 * ## Why it needs its own branch
 *
 * Nothing is broken. The build the tab is holding no longer exists, and the
 * only cure is to go and get the current one. That has two consequences the
 * generic error path gets wrong in opposite directions:
 *
 *  1. `router.refresh()` — what «حاول تاني» does first — CANNOT fix it. The
 *     refresh re-fetches the RSC payload but leaves the loaded client bundle,
 *     and the stale action id lives in that bundle. The student or editor
 *     presses retry, watches nothing happen, and only the second press (which
 *     escalates to `location.reload()`) actually works. So this skips straight
 *     to the reload that was always going to be required.
 *  2. It is not a fault, so it must not be filed as one. `/admin/errors` exists
 *     to answer «إيه اللي بايظ» and every deploy-shaped row in it is a row that
 *     makes a real one harder to see.
 *
 * ## Matched on the message, deliberately
 *
 * Next throws this as an internal error type it does not export, and the
 * `digest` is absent (it is raised on the client). The sentence itself is the
 * only stable handle, and it is stable: it is a fixed string in Next's source
 * with the action id interpolated into it, and it carries a documentation URL
 * that would move with it. Matched on two invariant fragments rather than the
 * whole sentence so a reworded middle does not silently turn this off.
 *
 * ⚠️ If this stops matching, the symptom is the OLD behaviour — a retry that
 * needs two presses and a spurious row in the error log. Nothing breaks, which
 * is why it is worth stating: it will not announce itself.
 */
export function isStaleDeployError(error: Error): boolean {
  const message = error.message;
  return message.includes('Server Action') && message.includes('was not found on the server');
}


/**
 * The other shape of "this tab is older than the server it is talking to", and
 * the one that cost the admin course page an evening.
 *
 * Turbopack derives a client module's id from its FILE PATH, so the same number
 * identifies the same file in every build, and the client runtime keeps the
 * FIRST factory registered for an id and silently discards every later one. A
 * tab that outlived a deploy therefore has ids pinned to the OLD build's
 * factories — and when it then loads a chunk from the NEW build, that chunk's
 * modules are handed the old exports. Anything the new code reads that the old
 * module did not export is `undefined`.
 *
 * Recorded on production 2026-08-18 03:26 against `/admin/courses/{id}`:
 *
 *   TypeError: (0 , t.partialWithoutDefaults) is not a function
 *       at module evaluation (/_next/static/chunks/1n-wn64nqsgu1.js:1:37069)
 *       at W (/_next/static/chunks/turbopack-2mmb386ihfj61.js:1:7647)
 *
 * `packages/contracts/src/partial.ts` explains that specific one and why it can
 * no longer happen there. This predicate is about the CLASS, because the next
 * module to gain an export will do exactly the same thing.
 *
 * ## Matched on the stack, because the message is different every time
 *
 * There is no sentence to match — the message names whatever symbol was
 * missing. What IS constant is the two frames above: `module evaluation` is the
 * name Turbopack assigns every module factory (`Object.defineProperty(factory,
 * "name", {value: "module evaluation"})` in its chunk registration), and the
 * frame under it is always inside the runtime chunk, which is the only script
 * this app serves under that name.
 *
 * ## What it deliberately does NOT do
 *
 * It does not suppress the error report, and `isStaleDeployError` above still
 * does. A missing Server Action id is unambiguously a deploy artefact; a module
 * that failed to evaluate is only PROBABLY one — a genuine throw at a module's
 * top level looks identical from here, and `/admin/errors` is where this bug
 * was found. So the report stays and only the retry changes.
 */
export function isModuleEvaluationError(error: Error): boolean {
  const stack = error.stack ?? '';
  return stack.includes('at module evaluation') && /\/_next\/static\/chunks\/turbopack-/.test(stack);
}

/**
 * The THIRD shape of "this tab is older than the server it is talking to", and
 * the one the other two cannot see: the chunk never arrived at all.
 *
 * `isModuleEvaluationError` above is about a chunk that loaded and then threw
 * while evaluating. This is the case one step earlier — the browser asked for
 * `/_next/static/chunks/<hash>.js`, the container serving it was replaced
 * between the deploy and the request, and that filename does not exist in the
 * new build. Turbopack's loader rejects with a fixed sentence:
 *
 *   Failed to load chunk /_next/static/chunks/1n-wn64nqsgu1.js from script
 *
 * Every route in this app splits at least one chunk, so this is not an exotic
 * path: it is what a student sitting on a page and then opening a dialog, a
 * player or an admin panel hits, for as long as their tab keeps the old build's
 * module graph in memory.
 *
 * ## Why it needs saying now and did not before
 *
 * `public/sw.js` caches `/_next/static/` cache-first, so until this change the
 * device's own copy of the old chunk was quietly covering for the server no
 * longer having one — an accident, and one bounded by `MAX_ASSET_ENTRIES`
 * rather than by anything meaning "still needed". That worker now versions its
 * cache per build (`ServiceWorkerRegister` registers `/sw.js?v=<build id>`),
 * which is what makes «كل بناء جديد يمسح الكاش القديم» true — and takes the
 * accident away with it. This predicate is the deliberate replacement: instead
 * of serving last week's bytes forever, the tab notices it is behind and goes
 * and gets the current build.
 *
 * ## Matched on `name`, NOT on the message
 *
 * Unlike the two above, this one has a real handle. Turbopack's chunk loader
 * builds the error and then stamps it:
 *
 *   let l = Error(`Failed to load chunk ${n} ${o}${e ? `: ${e}` : ''}`, …);
 *   throw (l.name = 'ChunkLoadError', l);
 *
 * — read out of this app's own shipped `turbopack-*.js`, not from documentation.
 * The message interpolates the URL, the source ("from module X", "as a runtime
 * dependency of chunk Y", "from an HMR update") and sometimes the underlying
 * error, so every part of it varies; `name` is a literal assignment that
 * survives minification, and it is the same name webpack has always used for
 * this class.
 *
 * ⚠️ This does NOT distinguish "the build moved" from "the network dropped" —
 * a 404 after a deploy and a failed fetch on a bad connection both arrive here,
 * because the loader cannot tell them apart either. That distinction matters
 * (reloading an offline student loses them the page they were on), so it is
 * made at the call site, where `navigator.onLine` is readable. See
 * `use-error-retry.ts`.
 *
 * Like `isModuleEvaluationError`, and unlike `isStaleDeployError`, this is NOT
 * suppressed in the error report. A chunk that will not load is usually a
 * deploy artefact and is sometimes a CDN or a network fault, and the second one
 * is worth seeing in `/admin/errors`.
 */
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError';
}
