'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';

/**
 * The BACKSTOP boundary, sitting above every route group.
 *
 * ## Why this exists when four surface boundaries already do
 *
 * The four — `(app)`, `(site)`, `(auth)`, `(admin)` — were written per surface
 * on purpose, and they still catch everything they were meant to. What none of
 * them can catch is a throw in the `layout.tsx` of their OWN segment, because
 * Next's `error.tsx` wraps the pages and the nested layouts BELOW it, never the
 * layout beside it. Two real paths land here rather than there:
 *
 *   · `(admin)/layout.tsx` awaits `getSession()` on its first line, and
 *     `lib/session.ts` throws on any non-401 non-ok response. A 429 from the
 *     shared throttle bucket the audit found is exactly that. Before this file,
 *     a rate-limited staff member had the whole document replaced by
 *     `global-error.tsx` — no fonts, no stylesheet, inline styles only.
 *   · The Suspense-wrapped chrome slots the group layouts render — `account-
 *     menu`, `rail-courses`, `notification-bell`, `site-account-slot` — all do
 *     server I/O and are rendered BY the layout, so a throw in any of them
 *     skips its group's boundary too.
 *
 * It also covers the routes that belong to no group: `/offline`,
 * `/md/[[...slug]]`, `/docs/api`, `/dev/*`.
 *
 * So the hierarchy reads: a surface boundary for anything below a group layout
 * → this file for the group layouts themselves and the ungrouped routes →
 * `global-error.tsx` only if the ROOT layout is what broke.
 *
 * ## Why it looks like nothing in particular
 *
 * It renders inside the root layout — fonts, `globals.css` and the theme are
 * all alive, which is the whole advantage it has over `global-error.tsx` — but
 * OUTSIDE every group shell, so there is no rail, no marketing nav, no
 * `.site-*` palette and no `.panel` object guaranteed to be in scope for the
 * surface the reader came from. It genuinely cannot know which half of the
 * product it is standing in; that is why it, and not a surface boundary, caught
 * the error.
 *
 * Two consequences, both deliberate:
 *
 *   · Only base tokens (`--color-*` / `text-fg` / `border-line`) — the ones
 *     `globals.css` defines for the whole document. Nothing from
 *     `app/(site)/styles/`, which is not loaded on an app route, and nothing
 *     that assumes the product shell.
 *   · The escape hatch is `/` and not `/dashboard`. A signed-out visitor sent
 *     to the dashboard is bounced to `/login` and reads that as a second
 *     failure; `/` is correct for everyone and `proxy.ts` forwards a signed-in
 *     student onward from there anyway.
 *
 * A plain `<a>` rather than `<Link>`, for the reason `(app)/error.tsx` records:
 * `reset()` re-renders the same segment and reproduces a deterministic throw
 * forever, so the way out has to be a document load — and a soft navigation to
 * the URL already in the address bar can be answered from the router cache and
 * visibly do nothing.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="space-y-3 rounded-lg border border-line p-5 sm:p-6">
        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">
          {copy.errors.root.title}
        </h1>
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.errors.root.body}
        </p>

        {/* Column below `sm`: two 44px targets side by side do not fit a 320px
            viewport without a label wrapping mid-word. */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {copy.common.retry}
          </button>

          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {copy.nav.home}
          </a>
        </div>

        {/* Conditional: `digest` is undefined for a client-side throw and in
            development. `dir="ltr"` so the bidi algorithm does not reorder a
            hex run someone is reading down a phone line. */}
        {error.digest ? (
          <p className="pt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" className="font-[family-name:var(--font-mono)]">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
