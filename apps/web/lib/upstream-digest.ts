/**
 * The digest stamped on an API answer of `429 Too Many Requests`.
 *
 * The same device as `UPSTREAM_TIMEOUT_DIGEST` in `./api`, and for the same
 * reason: Next keeps a digest that is already set (`create-error-handler.js`,
 * «respect the original digest»), so a constant stamped on the server is the one
 * bit of information that survives to the browser's error boundary in a
 * production build, where the message does not.
 *
 * ## Why a throttle needs its own bit
 *
 * The exam pages recorded 41 and 7 render failures in the hours a live exam was
 * open, one digest each — one deterministic message per page, from many
 * students. The logs that would say which status it was are gone, but a
 * throttle is the candidate a student can cause just by waiting for a paper to
 * open: every reload of `/quizzes/<id>` is half a dozen API reads (session,
 * rail, bell, the overview itself) against a per-session `medium` limit of
 * sixty a minute. A refusal like that is over in seconds, so the right answer
 * is not an error screen with a button — it is the same screen trying again by
 * itself, later than an ordinary failure would (`lib/auto-retry.ts`). Without
 * this bit the boundary cannot tell it from a real fault, and with
 * `instrumentation.ts` filing the real message, the next one will say whether
 * this was it.
 *
 * Its own module, not an export added to `./api`: that file is in every client
 * bundle, and a tab from an older build reading a newer chunk would see a fresh
 * export as `undefined` — which, compared against `error.digest`, is TRUE for
 * every client-side error that has no digest at all.
 */
export const UPSTREAM_BUSY_DIGEST = 'UPSTREAM_BUSY';
