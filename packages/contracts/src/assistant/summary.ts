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

  /**
   * The newest UNREAD message from the instructor, truncated server-side.
   *
   * ## Why a string is on the launcher's probe at all
   *
   * Everything else here is a primitive because the launcher only draws a dot.
   * This is for the dashboard card, which is the surface «رسايل م. أيمن»
   * actually depends on: a message written to be read the day it arrives
   * («ذاكرهم النهارده وهما لسه طازة») is worth nothing behind a 56px disc in a
   * corner that a student has no reason to press. The card carries the opening
   * lines and hands off to the thread, which is still the only place it can be
   * answered.
   *
   * ## Why it does not cost a request
   *
   * The card and the launcher share this one response — `loadAssistantSummary`
   * de-duplicates concurrent callers, so mounting both on the dashboard issues
   * a single fetch. Giving the card its own endpoint would have doubled the
   * traffic on the busiest authenticated path in the product, which is the
   * cost this shape was carved out of `…/mine` to remove in the first place.
   *
   * ## Why it is TRUNCATED, and why it is still a string
   *
   * Cut to `SUMMARY_PREVIEW_MAX` by the service, so a 2000-character message
   * does not ride on every page load of every route to fill a card that shows
   * four lines. It stays a plain string and not a schema-parsed object for the
   * reason the header gives: no Zod may enter this file.
   *
   * `null` whenever there is nothing unread — including for a guest, who has
   * no account to be written to.
   */
  latestFromAyman: string | null;
}

/**
 * How much of the message rides on the probe. Four lines of the card at the
 * width it renders, which is where a teaser stops being a teaser.
 */
export const SUMMARY_PREVIEW_MAX = 240;

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

  const { unread, hasThread, hasOpenThread, isSignedIn, latestFromAyman } = value as Record<
    string,
    unknown
  >;

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
  if (latestFromAyman !== null && typeof latestFromAyman !== 'string') {
    throw new TypeError('assistant summary: `latestFromAyman` must be a string or null');
  }

  // Rebuilt field by field rather than returned as-is: whatever else the
  // server decided to send does not become widget state.
  return { unread, hasThread, hasOpenThread, isSignedIn, latestFromAyman };
}

/**
 * `GET /api/admin/conversations/unread-count` — how many threads still need an
 * answer. The mirror image of the probe above, from the instructor's side.
 *
 * It lives in THIS file, and not beside `AdminUnreadCountSchema` in
 * `./conversation`, for the same bundling reason the header sets out: the
 * sidebar badge polls this from a component mounted on every admin screen, and
 * importing `./conversation` to check one integer would pull that module's
 * whole Zod schema set — the inbox rows, the thread, the message — into the
 * first chunk of every page in the admin. The schema stays where it is for the
 * server, which pays nothing for it.
 */
export function parseAdminUnreadCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('inbox unread count: expected an object');
  }

  const { unread } = value as Record<string, unknown>;

  if (typeof unread !== 'number' || !Number.isInteger(unread) || unread < 0) {
    throw new TypeError('inbox unread count: `unread` must be a non-negative integer');
  }

  return unread;
}
