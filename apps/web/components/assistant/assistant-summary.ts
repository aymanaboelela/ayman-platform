'use client';

import {
  parseMyConversationSummary,
  type MyConversationSummary,
} from '@ayman/contracts/assistant/summary';
import { apiGetNarrow } from '@/lib/api';

/**
 * "Who is this, and is there a reply waiting?" — the question the LAUNCHER
 * asks, once per page load.
 *
 * ## It exists to be imported STATICALLY, which is the opposite of its sibling
 *
 * `./assistant-session` is a module of its own so that it can be `import()`ed
 * and keep Zod off the critical path. This one is a module of its own so that
 * it does not have to be: `@ayman/contracts/assistant/summary` is four
 * primitives and a hand-written narrowing function with no schema behind it,
 * so nothing here reaches Zod, nothing lands in a route's
 * `page_client-reference-manifest.js` that was not already there, and no chunk
 * is fetched after hydration on a page whose visitor will never open the
 * panel. The probe costs one small request and stops.
 *
 * That was the point of carving `…/mine/summary` out of `…/mine`. The old
 * probe pulled an entire conversation — every message the student and the
 * instructor had exchanged — and a 62 KB schema to check it with, on every
 * page load of every route, to decide whether to draw a ten-pixel dot.
 *
 * ## The validation is still not optional
 *
 * Narrowing by hand is not the same as trusting the response. A drifted
 * contract throws here, at the fetch, where the widget's `catch` treats it
 * like an unreachable API; the alternative is `undefined` surfacing in the
 * panel hours later on someone else's phone. Two booleans, a count and a flag
 * are cheap to check, which is exactly why this shape is small enough to check
 * without a schema.
 */
export function loadAssistantSummary(): Promise<MyConversationSummary> {
  /*
   * IN-FLIGHT de-duplication, not a cache.
   *
   * The dashboard mounts two readers of this probe — the launcher and
   * «رسالة من م. أيمن» — and they mount in the same tick, so without this they
   * would double the traffic on the busiest authenticated endpoint in the
   * product. The dashboard is also the page whose parallel reads already
   * started drawing 429s from the `short` throttle (see the comment on
   * `getTaxonomyOrNull` in `dashboard/page.tsx`), which is why "it is only one
   * extra request" is not an argument that holds here.
   *
   * Deliberately NOT a TTL cache of the RESULT. The dot has to clear the
   * moment the student reads the thread, and a summary held for even a few
   * seconds after that is a badge that lies — the exact failure this endpoint
   * exists to prevent. Sharing only the pending promise collapses the
   * simultaneous mounts and leaves every later call a real fetch.
   */
  inFlight ??= apiGetNarrow(
    '/api/assistant/conversations/mine/summary',
    parseMyConversationSummary,
  ).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

let inFlight: Promise<MyConversationSummary> | null = null;
