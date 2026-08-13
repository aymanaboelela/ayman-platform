'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';
import { useErrorRetry } from '@/lib/use-error-retry';

/**
 * The public marketing surface's error boundary: landing, catalog, year
 * listings, essentials, news, the legal pages.
 *
 * Different audience from `(app)/error.tsx` and therefore a different screen,
 * which is the point of splitting these per area rather than writing one. The
 * person reading this has no account, nothing in progress and no reason to
 * stay — so there is nothing to reassure them about and the whole job is to
 * keep them on the site. `copy.errors.site.body` says the rest of the site is
 * fine, which is literally true of a per-route-group boundary.
 *
 * It renders in `children`'s place inside `(site)/layout.tsx`, so it keeps the
 * `.site` palette, the nav and the footer, and it is written in that surface's
 * own vocabulary — `.page-head`, `.site-shell`, `.site-btn` — rather than in
 * the product's `--color-*` utilities. The two halves of this app style
 * themselves differently on purpose; an error screen is the last place to
 * start mixing them, because a page that suddenly looks like a different
 * website is exactly the impression this boundary exists to prevent.
 *
 * `.site-btn`'s specular highlight needs the delegated pointer listener that
 * `<SpecularButtons/>` installs — it is mounted by the same layout, above
 * this, so both buttons behave like every other button on the surface.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);
  const { retry, retrying } = useErrorRetry(error, reset);

  return (
    <main>
      {/*
        `.page-head` and not a hand-rolled block: its `padding-top` is
        `calc(var(--site-nav-h) + …)`, and the marketing nav is FIXED. Any
        other container would put this heading underneath it.
      */}
      <header className="page-head site-shell">
        <h1 className="page-title">{copy.errors.site.title}</h1>
        <p className="site-lead">{copy.errors.site.body}</p>
      </header>

      <div className="site-shell" style={{ paddingBottom: 'clamp(3.5rem, 7vw, 6rem)' }}>
        {/*
          Centred to match `.page-head`, which is `text-align: center` on this
          surface — the signed-in boundary is start-aligned because its panel
          is, and the two conventions are each correct where they sit.
        */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* `retry`, not the bare `reset` this was — see
              `lib/use-error-retry.ts`. The disabled utilities sit alongside
              `.site-btn` rather than inside it: the surface's button object has
              no busy state of its own and one visitor-facing screen is not the
              place to invent one. */}
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            aria-busy={retrying}
            className="site-btn site-btn--solid disabled:cursor-wait disabled:opacity-70"
          >
            {copy.common.retry}
          </button>

          {/*
            Plain `<a>`, deliberately, for the reason `(app)/error.tsx` records
            at length: `/` is the single likeliest route to be the one that
            threw, and a soft navigation to the URL already in the address bar
            can be answered from the router cache and visibly do nothing. A
            document load re-asks the server, which is the only place a
            recovery can come from.

            `copy.nav.home` is the label the site nav above it already uses for
            this destination.
          */}
          <a href="/" className="site-btn site-btn--outline">
            {copy.nav.home}
          </a>
        </div>

        {/*
          Quieter here than on the student surface and quieter still than on
          the admin's. A visitor has no support channel that takes a reference
          number, so this is here for the one case where someone reports the
          page over WhatsApp — not as something the page asks to be read.
        */}
        {error.digest ? (
          <p
            className="mt-8 text-center"
            style={{ fontSize: 'var(--fs-text-xs)', color: 'var(--site-fg-2)' }}
          >
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" style={{ fontFamily: 'var(--font-mono)' }}>
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
