'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';

/**
 * The last boundary in the product: the ROOT layout itself threw.
 *
 * Everything the other four `error.tsx` files take for granted is gone here.
 * `app/layout.tsx` is what renders `<html>`, `<body>`, the font variables, the
 * prepaint script that sets `data-theme`, the inline branding `<style>`, and
 * every provider — and none of it ran. React hands this component the whole
 * document instead, which is why it renders its own `<html lang="ar" dir="rtl">`
 * and `<body>`: without them the page has no language, no direction, and no
 * root element at all.
 *
 * ## Why every style on this page is inline
 *
 * `globals.css` reaches the browser as an import from the root layout. On the
 * one screen that exists because the root layout failed, no stylesheet can be
 * assumed to have loaded — and a stylesheet is a plausible thing to have been
 * the failure. A class name here would be a bet that the CSS survived, on the
 * page whose entire job is to work when nothing else did. So: no `className`,
 * no design tokens, no `@ayman/ui`, nothing that resolves through a build
 * artifact. Inline attributes and one `<style>` for the `:focus-visible` ring
 * that inline styles cannot express.
 *
 * ## Why there is no colour in it
 *
 * `color-scheme: light dark` and then no `background` and no `color` at all.
 * The browser paints its own canvas — white on a light phone, near-black on a
 * dark one — and picks the matching default text colour, with no media query,
 * no token and no prepaint script involved. Hard-coding a light background
 * here would flash white at a student reading in the dark, and hard-coding a
 * dark one would do the reverse; the two rules that make everything else on
 * this page work (`opacity` for the muted line, `currentColor` for the
 * borders) are theme-agnostic for the same reason.
 *
 * The font is a system stack, not `--font-plex-arabic`: that variable is
 * declared by a class the root layout puts on `<html>`, so it does not exist
 * on this page. Both mobile platforms resolve Arabic from `system-ui`.
 *
 * ## The two actions
 *
 * `reset()` re-attempts the render with the client runtime still in memory.
 * That is the right first try — a transient throw (an API timeout during
 * `getBranding()`) clears on it — and it is the cheap one.
 *
 * The secondary is deliberately NOT a link to `/` or to `/dashboard`, the way
 * the other boundaries' is. Every route in the product renders through the
 * root layout that just failed, so there is nowhere to send anyone that is
 * not straight back into it. `location.reload()` is a different KIND of
 * action rather than a second destination: it discards the entire client
 * runtime and re-requests the document, which is the only recovery available
 * if what broke was a module that failed to evaluate — the one thing
 * `reset()` structurally cannot fix, because it re-runs the same broken
 * module graph.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);

  return (
    <html lang="ar" dir="rtl" style={{ colorScheme: 'light dark' }}>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "Noto Sans Arabic", Tahoma, Arial, sans-serif',
          lineHeight: 1.7,
        }}
      >
        {/*
          The one rule that cannot be an inline style. A keyboard user on this
          page has exactly two targets and no other affordance on screen; the
          UA default outline is drawn from the UA text colour, which is what we
          want in both themes, so this only widens it into something visible
          rather than restyling it.
        */}
        <style>{`.ge-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}`}</style>

        <main style={{ maxWidth: '32rem', width: '100%', textAlign: 'start' }}>
          <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.375rem', fontWeight: 600 }}>
            {copy.errors.global.title}
          </h1>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.9375rem', opacity: 0.75 }}>
            {copy.errors.global.body}
          </p>

          {/*
            `flex-wrap` rather than a media query: at 320px the two labels do
            not fit on one line, and a query would need a breakpoint value that
            this page has no token for.

            Both are >= 44px tall unconditionally. The `min-h-11`/`md:` dance
            the rest of the product does is a Tailwind concern, and there is no
            Tailwind here — but this screen is reached from a phone as often as
            from anything else, so the floor still applies.
          */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              className="ge-btn"
              onClick={reset}
              style={{
                minHeight: '44px',
                padding: '0 1.25rem',
                borderRadius: '8px',
                border: '1px solid currentColor',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copy.common.retry}
            </button>
            <button
              type="button"
              className="ge-btn"
              onClick={() => window.location.reload()}
              style={{
                minHeight: '44px',
                padding: '0 1.25rem',
                borderRadius: '8px',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                fontSize: '0.9375rem',
                opacity: 0.75,
                cursor: 'pointer',
              }}
            >
              {copy.errors.global.reload}
            </button>
          </div>

          {/*
            Present in production, absent in development and absent for a
            client-side throw — see `copy.errors.digestLabel`. `dir="ltr"` on
            the value alone: the digest is a hex string, and in an RTL
            paragraph the bidi algorithm would reorder a run that has no
            meaningful order, so a student reading it out would read it
            backwards.
          */}
          {error.digest ? (
            <p style={{ margin: '1.5rem 0 0', fontSize: '0.8125rem', opacity: 0.55 }}>
              {copy.errors.digestLabel}:{' '}
              <span dir="ltr" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {error.digest}
              </span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
