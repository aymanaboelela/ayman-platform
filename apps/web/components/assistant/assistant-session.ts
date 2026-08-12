'use client';

import { MyConversationSchema, type MyConversation } from '@ayman/contracts/assistant/conversation';
import { apiGet } from '@/lib/api';

/**
 * "Who is this, and is there a reply waiting?" — one request, and the ONLY
 * reason this is a module of its own.
 *
 * ## It exists to be `import()`ed, not to be imported
 *
 * `MyConversationSchema` is a Zod schema, and Zod is a 62 KB gzip runtime. The
 * widget that asks this question is mounted in the `(site)`, `(app)` AND
 * `(auth)` layouts, so anything it reaches STATICALLY becomes part of its
 * client reference on effectively every route a student can open — listed in
 * that route's `page_client-reference-manifest.js`, preloaded from a `<script>`
 * in the `<head>`, parsed and compiled before the page is interactive. That is
 * what the measurement found: one 62 KB chunk on 21 prerendered routes, on the
 * critical path of the landing page opened from a WhatsApp link.
 *
 * Pulled in through `await import('./assistant-session')` instead, the same
 * bytes become an async chunk: not in any manifest, not preloaded, not on the
 * path to first interaction. The probe still runs on every page load, so the
 * chunk is still FETCHED — see the widget's own note for why that request
 * cannot move and what would let it — but it no longer delays the page.
 *
 * ## The validation is not optional
 *
 * `apiGet` parses the body against this schema, and the alternative considered
 * and rejected was reading `conversation`/`isSignedIn` off raw JSON to skip
 * Zod entirely. An unvalidated response here fails as `undefined` inside the
 * panel, hours later, on someone else's phone; a contract drift that throws at
 * the fetch is a bug report. 62 KB is not worth that trade.
 */
export function loadAssistantSession(): Promise<MyConversation> {
  return apiGet('/api/assistant/conversations/mine', MyConversationSchema);
}
