'use client';

import { MyConversationSchema, type ConversationThread } from '@ayman/contracts/assistant/conversation';
import { apiGet } from '@/lib/api';

/**
 * The visitor's own conversation, fetched when the PANEL opens onto it — and
 * the ONLY reason this is a module of its own.
 *
 * ## It exists to be `import()`ed, not to be imported
 *
 * `MyConversationSchema` is a Zod schema, and Zod is a 62 KB gzip runtime. The
 * widget that opens this panel is mounted in the `(site)`, `(app)` AND `(auth)`
 * layouts, so anything it reaches STATICALLY becomes part of its client
 * reference on effectively every route a student can open — listed in that
 * route's `page_client-reference-manifest.js`, preloaded from a `<script>` in
 * the `<head>`, parsed and compiled before the page is interactive. That is
 * what the measurement found: one 62 KB chunk on 21 prerendered routes, on the
 * critical path of the landing page opened from a WhatsApp link.
 *
 * Pulled in through `await import('./assistant-session')` instead, the same
 * bytes become an async chunk: not in any manifest, not preloaded, not on the
 * path to first interaction.
 *
 * ## And now it is not fetched on every page load either
 *
 * This used to run once per page load, because the unread dot on the launcher
 * needed an answer before anyone opened anything — so the chunk was still
 * REQUESTED on every page, after hydration, by students who would never open
 * the panel. That question moved to `./assistant-summary`, which answers it in
 * four primitives with no schema at all. What is left here is the
 * conversation itself, which nothing renders until the panel is showing it:
 * the chunk and the request are now both consequences of a deliberate tap, or
 * of the `?assistant=1` a reply notification carries.
 *
 * ## The validation is not optional
 *
 * `apiGet` parses the body against this schema, and the alternative considered
 * and rejected was reading `conversation` off raw JSON to skip Zod entirely.
 * An unvalidated response here fails as `undefined` inside the thread view,
 * hours later, on someone else's phone; a contract drift that throws at the
 * fetch is a bug report. 62 KB is not worth that trade — and by this point the
 * panel is open, so the bytes are not costing anyone a page.
 *
 * `isSignedIn` comes back on this shape too and is deliberately dropped here:
 * the widget already has it from the summary, and two sources for one fact is
 * how they end up disagreeing. See `MyConversationSchema` for why the endpoint
 * still answers it.
 */
export function loadAssistantThread(): Promise<ConversationThread | null> {
  return apiGet('/api/assistant/conversations/mine', MyConversationSchema).then(
    (result) => result.conversation,
  );
}
