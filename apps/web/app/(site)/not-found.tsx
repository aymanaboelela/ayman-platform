import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';

/**
 * The public marketing surface's 404: a dead course slug, an unpublished
 * article, `/years/9`.
 *
 * Split per surface for the same reason `error.tsx` is — see the note there.
 * The reader here has no account and no reason to stay, so the whole job is to
 * keep them on the site, and the destination that most often has what they
 * came for is the CATALOGUE, not the homepage. Someone who landed on a course
 * URL that no longer resolves wants a course; `/` would make them start over.
 *
 * ## The status code this renders under is 200, and that is not this file's bug
 *
 * `next.config.ts` sets `cacheComponents: true`, so these routes are served as
 * a prerendered shell that streams before the dynamic segment runs. By the time
 * `notFound()` executes the status line has already been sent — measured on
 * production 2026-08-15, `/courses/no-such-course` answered **200** with
 * `x-nextjs-postponed: 1` while correctly rendering the not-found UI.
 *
 * So this file fixes what the READER sees. It cannot fix what Googlebot sees,
 * and the two need different work: the status has to be settled before the
 * shell is committed, which means validating the slug in `proxy.ts` or
 * accepting a dynamic render on these routes. Do not "fix" the 200 by deleting
 * the `notFound()` calls — the calls are correct and are what select this file.
 *
 * `.page-head` and not a hand-rolled block, for the reason `(site)/error.tsx`
 * records: its `padding-top` is `calc(var(--site-nav-h) + …)` and the marketing
 * nav is FIXED, so any other container puts the heading underneath it.
 *
 * No retry button: nothing failed. See `app/not-found.tsx` for why that is a
 * deliberate difference from the error boundaries and not an omission.
 */
export default function SiteNotFound() {
  const c = copy.notFound.site;

  return (
    <main>
      <header className="page-head site-shell">
        {/* Latin digits, isolated with `dir="ltr"`, and kept out of the `<h1>`
            so the accessible page title is the Arabic sentence. */}
        <p dir="ltr" className="site-eyebrow">
          404
        </p>
        <h1 className="page-title">{c.title}</h1>
        <p className="site-lead">{c.body}</p>
      </header>

      <div className="site-shell" style={{ paddingBottom: 'clamp(3.5rem, 7vw, 6rem)' }}>
        {/* Centred to match `.page-head`, which is `text-align: center` on this
            surface — same convention `(site)/error.tsx` follows. */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* `.site-btn`'s specular highlight needs the delegated pointer
              listener `<SpecularButtons/>` installs from `(site)/layout.tsx`,
              which is above this — so both of these behave like every other
              button on the surface. */}
          <Link href="/courses" className="site-btn site-btn--solid">
            {c.cta}
          </Link>
          <Link href="/" className="site-btn site-btn--outline">
            {copy.nav.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
