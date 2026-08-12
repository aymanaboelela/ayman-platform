/**
 * `GET /api/assistant/conversations/mine/summary` — the handful of facts the
 * LAUNCHER can act on, and deliberately nothing else.
 *
 * ## Why this exists next to `MyConversationSchema`
 *
 * المساعد's launcher is mounted in `(site)`, `(app)` and `(auth)`, so it asks
 * "is there a reply waiting?" once per page load, for every visitor, forever.
 * Until this shape existed the answer arrived as the whole conversation —
 * every message the student and the instructor had ever exchanged — to decide
 * whether to draw a ten-pixel dot, on the landing page opened from a WhatsApp
 * link. Four primitives replace it. The conversation is now the PANEL's
 * business, fetched when it opens, which is the only moment anything renders
 * a message.
 *
 * ## ⚠️ No Zod in this file, and that is the whole point
 *
 * Every other contract in this package is a Zod schema. This one must not be.
 * Zod is a 62 KB gzip runtime, and this is the ONE contract the launcher
 * imports statically — that static import is what makes the probe cost a
 * request and nothing else. A schema here would put those bytes back into the
 * `<head>` of every prerendered route, which is the exact cost the endpoint
 * was carved out to remove. `assistant-widget.tsx` carries the measurement.
 *
 * So the validation is hand-written rather than skipped. An unvalidated
 * response fails as `undefined` in the panel hours later on someone else's
 * phone; a shape that throws at the fetch is a bug report. Adding a fifth
 * primitive below is cheap. Adding an import of the package's own zod subpath
 * is not, and would be the regression — `client-barrel.test.ts` decides which
 * contracts are "Zod-bearing" by reading this file's text, so even naming that
 * specifier here would put this module back on the wrong side of the line.
 */

export interface MyConversationSummary {
  /**
   * Instructor replies the visitor has not read yet, `0` when there is no
   * thread. A count rather than a boolean because that is what the row
   * already knows — the launcher only asks whether it is above zero, but the
   * accessible name on the button is the kind of thing that grows a number.
   */
  unread: number;

  /**
   * There is a thread at all, CLOSED ONES INCLUDED.
   *
   * This is what `?assistant=1` from a reply notification opens onto, so it
   * has to stay true after the instructor closes the conversation — otherwise
   * the link in a notification he answered and then filed leads to a page
   * where nothing happens.
   */
  hasThread: boolean;

  /**
   * That thread is still live: `open` or `answered`, not `closed` — the same
   * sense of "open" `MAX_OPEN_PER_IDENTITY` counts in.
   *
   * Separate from `hasThread` because the launcher treats the two
   * differently: a live thread is what a tap lands on instead of the menu,
   * while a finished one leaves the menu in place. Collapsing them into one
   * boolean either strands a resolved conversation in front of someone
   * arriving with a new question, or breaks the notification link above.
   */
  hasOpenThread: boolean;

  /**
   * Whether the caller is signed in — answered HERE rather than by a second
   * request to `/api/session`, for the reason `MyConversationSchema` sets out
   * for the full shape: the handoff form asks a guest for a name and a
   * WhatsApp number, and must never ask a student to re-type what their
   * profile already holds.
   *
   * It is NOT an authorization signal and nothing gates on it: the server
   * takes identity from the session on every write regardless of what the
   * client believes.
   */
  isSignedIn: boolean;
}

/**
 * The narrowing that stands in for a schema.
 *
 * Throws rather than filling in defaults, so a drifted contract fails the same
 * way `schema.parse` would — the widget's `catch` treats it exactly like an
 * unreachable API and shows no dot. A silently-defaulted `unread` would be a
 * dot that stopped appearing with nobody to notice, which is the failure this
 * endpoint exists to prevent, not one it may cause.
 */
export function parseMyConversationSummary(value: unknown): MyConversationSummary {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('assistant summary: expected an object');
  }

  const { unread, hasThread, hasOpenThread, isSignedIn } = value as Record<string, unknown>;

  if (typeof unread !== 'number' || !Number.isInteger(unread) || unread < 0) {
    throw new TypeError('assistant summary: `unread` must be a non-negative integer');
  }
  if (
    typeof hasThread !== 'boolean' ||
    typeof hasOpenThread !== 'boolean' ||
    typeof isSignedIn !== 'boolean'
  ) {
    throw new TypeError('assistant summary: `hasThread`, `hasOpenThread` and `isSignedIn` must be booleans');
  }

  // Rebuilt field by field rather than returned as-is: whatever else the
  // server decided to send does not become widget state.
  return { unread, hasThread, hasOpenThread, isSignedIn };
}
