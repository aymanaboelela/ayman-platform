'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';

/**
 * The signed-in student's error boundary, and the one of the five that
 * matters most: whoever sees this was in the middle of a lesson, a revision
 * or a graded attempt, on a phone, and up to now got Next's bare English
 * error page instead.
 *
 * It renders in `children`'s place INSIDE `(app)/layout.tsx`, so the rail, the
 * topbar, the account menu and المساعد are all still on screen and still
 * working. That is the whole argument for a per-area boundary rather than one
 * generic page: the student can see that only this panel is broken and that
 * the rest of their account is where they left it — the copy says so, and the
 * chrome around the copy proves it.
 *
 * `<main>` is carried here, not by the layout. `(app)/layout.tsx` deliberately
 * renders no landmark and no width constraint ("Each page carries its own
 * `<main>`"), and this component stands exactly where a page would, so
 * omitting it would leave the route with no main landmark at all.
 *
 * The container matches `/onboarding`'s (`mx-auto max-w-2xl px-6 py-16`) and
 * the panel is the same `.panel` object as `TaxonomyUnavailable`, because they
 * are the same event told at two different levels — that screen is this
 * failure caught one segment lower, where the page could still say something
 * specific about which read failed.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="panel space-y-3 p-5 sm:p-6">
        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">
          {copy.errors.app.title}
        </h1>
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {copy.errors.app.body}
        </p>

        {/*
          Column below `sm`, row above. Two 44px targets side by side do not
          fit a 320px viewport without one of the labels wrapping mid-word.
        */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {copy.common.retry}
          </button>

          {/*
            A plain `<a>`, and NOT a `<Link>` — the same measurement
            `TaxonomyUnavailable` records for its retry, arrived at from the
            other direction.

            `reset()` alone strands a student whose error is deterministic:
            it re-renders the identical segment and reproduces the identical
            throw, forever. This is the way out of that, so it has to work in
            the one case that guarantees it is needed — /dashboard is itself
            the route that threw. A `<Link href="/dashboard">` from
            /dashboard is a soft navigation to the URL already in the address
            bar, which the router may answer from its own cache, so the press
            would visibly do nothing. A document load re-issues the request to
            the server, which is where the recovery would have to come from
            anyway.

            The label is `copy.nav.dashboard` rather than a phrase written for
            this screen: it is the word the topbar's own /dashboard link uses,
            and a student who has just been dropped somewhere unfamiliar
            should be reading a noun they already recognise, not learning a
            new one.
          */}
          <a
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {copy.nav.dashboard}
          </a>
        </div>

        {/*
          Production-only, and quiet on purpose. A student never needs to read
          this, but a student who has messaged المساعد about a screen that will
          not open is the only person who can connect it to the server log —
          see `copy.errors.digestLabel` for why the value is never shown bare
          and why `error.message` is shown nowhere.
        */}
        {error.digest ? (
          <p className="pt-1 text-[length:var(--fs-text-xs)] text-fg-faint">
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
