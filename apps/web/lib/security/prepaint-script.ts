/**
 * The only inline script this application authors — applies the two pieces of
 * persisted UI state that MUST be on `<html>` before first paint
 * (`app/layout.tsx`):
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
export const PREPAINT_SCRIPT =
  `(function(){try{var d=document.documentElement;d.setAttribute('data-theme',localStorage.getItem('theme')==='dark'?'dark':'light');if(localStorage.getItem('rail')==='collapsed'){d.setAttribute('data-rail','collapsed');}}catch(e){}})();`;
