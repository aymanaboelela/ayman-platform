import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';

/**
 * Staff 404: an admin route whose record was deleted from under them — a
 * course, lesson, question, media asset or student id that no longer resolves.
 *
 * That is the case worth writing for, and it is why the copy names deletion
 * instead of guessing at a mistyped URL the way the public surface does. An
 * editor almost never types an admin URL by hand; they follow a link from a
 * list that was rendered before someone else removed the row.
 *
 * Structure follows `(admin)/error.tsx`: a bare `<div>` and not a `<main>`,
 * because `(admin)/layout.tsx` already provides the `<main>` landmark this
 * renders inside — two nested `<main>` elements would be a real a11y defect,
 * not a cosmetic one. Same `max-w-[76rem]` so it lines up with every other
 * admin screen instead of sitting at a different measure.
 *
 * No retry and no digest, for the reason given in `app/not-found.tsx`: nothing
 * failed here, so there is nothing to retry and no log line to quote. The
 * digest hint that `(admin)/error.tsx` shows — the one place on the site where
 * a reference number is genuinely actionable — has nothing to point at on a
 * 404 and is correctly absent.
 *
 * `<Link>` rather than the boundary's plain `<a>`: that `<a>` exists because a
 * soft navigation to the route that just threw can be served from the router
 * cache and do nothing. If `/admin` had matched, this file would not be
 * rendering, so the navigation is always real.
 */
export default function AdminNotFound() {
  const c = copy.notFound.admin;

  return (
    <div className="mx-auto w-full max-w-[76rem]">
      <div className="panel space-y-3 p-5 sm:p-6">
        <p dir="ltr" className="font-mono text-[length:var(--fs-text-xs)] text-fg-faint">
          404
        </p>

        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">{c.title}</h1>
        <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
          {c.body}
        </p>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {c.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
