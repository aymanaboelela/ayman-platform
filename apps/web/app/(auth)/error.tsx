'use client';

import { copy } from '@ayman/contracts/copy';
import { useErrorReport } from '@/lib/report-error';

/**
 * /login and /register.
 *
 * This one exists because of where the route group sits, not because the copy
 * needed a fifth voice. `(auth)` is a SIBLING of `(app)`, `(site)` and
 * `(admin)`, so none of their boundaries is an ancestor of it — without this
 * file a throw on the sign-in page would fall past all three to
 * `app/global-error.tsx`, which replaces the entire document with a styleless
 * page. Trading the split screen, the brand lockup and the showcase panel for
 * that, on the screen where a visitor is deciding whether this platform is
 * real, is a much larger loss than the file costs.
 *
 * No `<main>`: `(auth)/layout.tsx` renders `<main className="auth-pane">`
 * around `children` — unlike the student and site shells, which leave the
 * landmark to each page. This component stands where the form stands, inside
 * `.auth-pane__inner` and under the brand lockup, so it reuses `.auth-head`
 * for the same reason: the heading it replaces was «تسجيل الدخول» in that
 * exact position, and matching it keeps the column from reflowing.
 *
 * The wording is close to `copy.errors.site`'s on purpose — same visitor, one
 * screen later. The single thing it adds is that the account is untouched,
 * because someone who has just pressed «اعمل الحساب» and been handed an error
 * has no way of knowing whether it half-worked.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport(error);

  return (
    <>
      <header className="auth-head">
        <h1 className="auth-head__title">{copy.errors.auth.title}</h1>
        <p className="auth-head__sub">{copy.errors.auth.body}</p>
      </header>

      {/*
        The actions and the digest are wrapped as ONE child rather than left
        as two siblings. `.auth-pane__inner` is a flex column with a 32px gap,
        sized for the distance between the brand lockup, the heading and the
        form — every top-level element this component returns inherits that
        spacing, which is right between the heading and the buttons and far too
        wide between the buttons and a footnote about them.
      */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {copy.common.retry}
          </button>

          {/*
            Plain `<a>` — same measurement as the other three boundaries: a
            soft navigation to the route that just threw can come back out of
            the router cache unchanged, and /login IS the likeliest route to
            be the one that threw here.

            Home rather than a retry of the sign-in page itself: `reset()`
            above already offers that, and a visitor who cannot get in needs
            somewhere that is not this column.
          */}
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {copy.nav.home}
          </a>
        </div>

        {error.digest ? (
          <p className="text-[length:var(--fs-text-xs)] text-fg-faint">
            {copy.errors.digestLabel}:{' '}
            <span dir="ltr" className="font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </>
  );
}
