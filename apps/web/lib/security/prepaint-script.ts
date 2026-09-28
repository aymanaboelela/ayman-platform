/**
 * The only inline script this application authors. It does three things that
 * must happen before anything else on the page runs: the two below, and
 * `CHUNK_SCRIPT_RESCUE` further down, which has nothing to do with paint and
 * is here for the same reason — it is only correct if it is FIRST.
 *
 * The two pieces of persisted UI state that MUST be on `<html>` before first
 * paint (`app/layout.tsx`):
 *
 *   · `data-theme`  — prevents a flash of the wrong theme for a reader who has
 *                     chosen dark. ⚠️ It writes an attribute UNCONDITIONALLY,
 *                     defaulting to `light`, because light is the platform's
 *                     default and `prefers-color-scheme` is not consulted (see
 *                     `lib/theme.ts`). The server already renders
 *                     `data-theme="light"` on `<html>`, so this is what CHANGES
 *                     it for the dark reader rather than what establishes it —
 *                     which is also why a `localStorage` that throws leaves the
 *                     page correctly light instead of unthemed.
 *   · `data-rail`   — prevents the student shell's navigation rail from
 *                     painting at its full width and then snapping to the icon
 *                     width on hydration, which is a visible layout jump on
 *                     every page load for anyone who has collapsed it.
 *
 *                     ⚠️ It now writes `'expanded'` as well, and the absence of
 *                     the attribute means «مختارش» — not «مفتوح». That is what
 *                     lets the stylesheet pick a default from the WIDTH: a
 *                     296px rail on an 820px iPad leaves 524px of content, so
 *                     the tablet range starts collapsed while a laptop starts
 *                     open. A student who presses the toggle writes an explicit
 *                     value and is never overridden again.
 *
 *                     The old contract stored only `'collapsed'`, so there was
 *                     no way to say «فاتحه بإيدي» — and a width-based default
 *                     would have trapped anyone who wanted it open on a
 *                     tablet. `lib/rail.ts` documents the three states.
 *
 * Both are attributes read by CSS alone. Neither is React state, and that is
 * deliberate: a preference the server cannot read (it lives in `localStorage`)
 * can only avoid a flash by being applied before React exists. The components
 * that *change* these values (`ThemeToggle`, `RailToggle`) subscribe to their
 * own stores in `lib/theme.ts` and `lib/rail.ts`, which write the same keys
 * and set the same attributes — those stores drive labels and icons only.
 *
 * Lives in its own zero-dependency module so both the root layout (which
 * renders it) and `proxy.ts` (which hashes it for the authenticated CSP's
 * `script-src`) read the EXACT same bytes. A hash computed from a copy of
 * this string is a hash that goes stale silently the moment one copy
 * changes and the other doesn't — this file is what makes that impossible.
 * Extending the script is therefore safe: the hash is derived from this
 * constant at runtime and is never checked in.
 *
 * Not imported directly by `proxy.ts` from `app/layout.tsx` on purpose:
 * `layout.tsx` pulls in fonts, global CSS, and other React-only concerns
 * that have no business in `proxy.ts`'s Node-only, non-React bundle.
 *
 * One `try`/`catch` around both reads, not two: `localStorage` throws as a
 * unit (Safari private browsing, storage partitioning, some Firefox privacy
 * settings), so if the first read throws the second would throw identically.
 * Degrading to no attributes at all is the correct failure — system theme,
 * expanded rail, everything still usable.
 */
const THEME_AND_RAIL =
  `(function(){try{var d=document.documentElement;d.setAttribute('data-theme',localStorage.getItem('theme')==='dark'?'dark':'light');var r=localStorage.getItem('rail');if(r==='collapsed'||r==='expanded'){d.setAttribute('data-rail',r);}}catch(e){}})();`;

/**
 * The third job, and the only one that is not about paint: taking a FAILED
 * chunk `<script>` back out of the document, so the next load of that chunk
 * is a real download instead of a wait that can never end.
 *
 * ## The bug — «بتقعد تلود loading كده على طول، ولما أعمل refresh بتفتح»
 *
 * Turbopack's browser loader decides "this chunk is already loading" by
 * LOOKING for a `<script src>` with the chunk's URL. When it finds one, it
 * does not request anything — it attaches an `error` listener to that element
 * and waits for the chunk to register itself. Its own source says what
 * happens when that element has already failed:
 *
 *     "There is this edge where the script already failed loading, but we
 *      can't detect that. The Promise will never resolve in this case."
 *
 * The server HTML carries ~25 of those `<script async>` tags on every page.
 * One of them failing ONCE — a weak mobile connection, or the few seconds of
 * a deploy when the origin answers 404 — leaves a dead element in the head
 * for the rest of the tab's life. Every later navigation that needs that
 * chunk then suspends on it forever, and the route's `loading.tsx` is what
 * stays on screen: no error, no request in flight, nothing to time out.
 *
 * Measured on a production build (2026-09-28): `/profile` loaded with
 * `2femmq3pfbmwu.js` failing (it carries `next/link`, the avatar and half the
 * dashboard's client components), then «حسابي». The RSC payload for
 * `/dashboard` arrived in 40 ms — and the dashboard skeleton was still up 45
 * seconds later, exactly the screenshot that was reported. A refresh showed
 * the real page in 352 ms, because a new document re-requests every chunk.
 *
 * ## Why removing the element is the whole fix
 *
 * With the dead element gone, the loader finds nothing, creates a fresh
 * `<script>` and genuinely retries. That either succeeds — the blip is over,
 * the page renders — or fails through the loader's OWN `onerror`, which
 * rejects properly: the route's `error.tsx` paints and `useErrorRetry`'s
 * existing chunk recovery takes it from there. The one outcome that is no
 * longer possible is the silent, permanent wait.
 *
 * It cannot cause a double execution: a script that fired `error` never ran.
 * Nor can it take anything away from the loader: when the loader is already
 * listening on that element, the event still reaches its listener — the
 * propagation path is fixed when dispatch starts, so removing the node from
 * a capture listener on `window` does not stop the target phase.
 *
 * ## Why here, in the one inline script, and not in a component
 *
 * It has to be listening before the first chunk can fail, which means before
 * any chunk has run — nothing that ships inside a chunk can be early enough.
 * Resource `error` events do not bubble, so it is a CAPTURE listener on
 * `window`, the one place every one of them passes through. Scoped to
 * same-origin `/_next/static/` so a blocked analytics or YouTube script is
 * never touched.
 *
 * Its own IIFE and its own `try`, so a `localStorage` that throws in the
 * theme half can never keep this one from installing.
 */
export const CHUNK_SCRIPT_RESCUE =
  `(function(){try{window.addEventListener('error',function(e){try{var s=e.target;if(!s||s.tagName!=='SCRIPT'||!s.src)return;var u=new URL(s.src,location.href);if(u.origin!==location.origin||u.pathname.indexOf('/_next/static/')!==0)return;if(s.parentNode)s.parentNode.removeChild(s);}catch(x){}},true);}catch(e){}})();`;

export const PREPAINT_SCRIPT = THEME_AND_RAIL + CHUNK_SCRIPT_RESCUE;
