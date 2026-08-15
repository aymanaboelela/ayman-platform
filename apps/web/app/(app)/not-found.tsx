import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';

/**
 * The signed-in student's 404: a lesson, course or attempt that called
 * `notFound()` because the record behind the id is gone or was never theirs.
 *
 * Split per surface for the reason `(app)/error.tsx` records at length. The
 * difference that matters here is the DESTINATION: this reader has an account
 * and somewhere to be, so sending them to `/` — the signed-out marketing
 * landing page they have no use for — would read as a second dead end. The way
 * out is the dashboard, labelled `copy.nav.dashboard`, which is the word the
 * topbar already uses for it; someone who has just been dropped somewhere
 * unfamiliar should be reading a noun they recognise.
 *
 * `.panel` rather than the bare `border-line` box `app/not-found.tsx` uses:
 * this renders inside the student shell, where `.panel` is the surface's own
 * container object and every other block on every other screen is one.
 *
 * ## No retry, and no digest
 *
 * Both deliberate, and both a difference from the error boundary beside this
 * file rather than an omission — see `app/not-found.tsx`. A 404 is a fact
 * about the URL, not a transient failure, so a retry button is a promise the
 * page cannot keep; and since nothing threw there is no `digest` and no server
 * log line for it to point at.
 *
 * ## Why `<Link>` here when the error boundary insists on a plain `<a>`
 *
 * The boundary's `<a>` is load-bearing for one specific reason: /dashboard may
 * itself be the route that threw, and a soft navigation to the URL already in
 * the address bar can be answered from the router cache and visibly do
 * nothing. That cannot happen here. If /dashboard had matched, this file would
 * not be rendering — so the navigation is always to a different URL, always
 * real, and a `<Link>` is simply the faster of the two.
 */
export default function AppNotFound() {
  const c = copy.notFound.app;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="panel space-y-3 p-5 sm:p-6">
        {/* Out of the `<h1>` and `dir="ltr"`-isolated: the only Latin run on
            the screen, and not the page's accessible title. */}
        <p dir="ltr" className="font-mono text-[length:var(--fs-text-xs)] text-fg-faint">
          404
        </p>

        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">{c.title}</h1>
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.body}</p>

        {/* Column below `sm`, row above — two 44px targets do not fit a 320px
            viewport side by side without a label wrapping mid-word. */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {c.cta}
          </Link>

          <Link
            href="/library"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
          >
            {/* `copy.library.title` — the label /library gives itself, for the
                same reason the dashboard link above borrows the topbar's word.
                There is no `nav.library` key; the rail calls it «كورساتي»,
                which is a different (narrower) claim than the page makes. */}
            {copy.library.title}
          </Link>
        </div>
      </div>
    </main>
  );
}
