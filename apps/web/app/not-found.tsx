import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';

/**
 * The BACKSTOP 404, and the one that answers the most requests of the four.
 *
 * ## What it replaced
 *
 * Nothing. Until 2026-08-15 this app had no `not-found.tsx` on any surface, so
 * Next's built-in page answered every unmatched URL — measured on production
 * at `/this-does-not-exist`:
 *
 *     404 | This page could not be found.
 *
 * English, LTR, no stylesheet, no nav, no footer, no link out. On an Arabic
 * platform whose students are the least likely people on earth to read that
 * sentence, on a site where every other screen is written in Egyptian Arabic.
 *
 * ## Why THIS file is the important one
 *
 * Next resolves a 404 by walking UP from the matched segment, and a URL that
 * matches no route at all never enters a route group — so `(site)`, `(app)`
 * and `(admin)`'s own `not-found.tsx` files cannot catch it however carefully
 * they are written. Only this one can. The three beside it handle the other
 * case: a route that matched and then called `notFound()` because the record
 * behind it was missing.
 *
 * ## Why it looks like `app/error.tsx` and not like the site
 *
 * Same constraint, for the same reason, and the long note in that file applies
 * verbatim: this renders inside the ROOT layout — fonts, `globals.css` and the
 * theme are alive — but OUTSIDE every group shell, so there is no rail, no
 * marketing nav, and no `.site-*` palette in scope. It cannot know which half
 * of the product the reader came from. So: base tokens only, and the single
 * destination that is correct for a signed-out visitor and a signed-in student
 * alike is `/` — `proxy.ts` forwards a signed-in student onward from there.
 *
 * ## Two things this deliberately does NOT have
 *
 * · No retry button. `error.tsx` has one because a throw may be transient; a
 *   404 is a fact about the URL and pressing "try again" on it is a promise
 *   the page cannot keep. Ayman named this exact screen — "you press it and it
 *   says no, try again" — as the thing he did not want.
 * · No `error.digest`. Nothing failed, so there is no server log line to
 *   quote and a reference number would imply a fault that does not exist.
 *
 * `<Link>` and not a plain `<a>`, which is the opposite of what the error
 * boundaries do. Their `<a>` is load-bearing because `reset()` can re-render
 * the same broken segment and a soft navigation to the URL already in the
 * address bar can visibly do nothing. Neither applies here: the reader is
 * NEVER already on `/` (if they were, `/` matched and this file did not
 * render), so a soft navigation is a real navigation and the faster one.
 */
export default function RootNotFound() {
  const c = copy.notFound.root;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="space-y-3 rounded-lg border border-line p-5 sm:p-6">
        {/*
          `404` is rendered as a label above the heading rather than AS the
          heading. It is the only Latin glyph run on the screen, it carries no
          meaning a student needs, and making it the `<h1>` would hand screen
          readers a bare number as the page's title. `dir="ltr"` so the bidi
          algorithm does not reorder it against the Arabic beside it.
        */}
        <p
          dir="ltr"
          className="font-[family-name:var(--font-mono)] text-[length:var(--fs-text-xs)] text-fg-muted"
        >
          404
        </p>

        <h1 className="text-[length:var(--fs-title-3)] font-medium text-fg">{c.title}</h1>
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.body}</p>

        {/* `min-h-11` = 44px, the tap target floor used by every other button
            on this surface. */}
        <div className="pt-1">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            {c.cta}
          </Link>
        </div>
      </div>
    </main>
  );
}
