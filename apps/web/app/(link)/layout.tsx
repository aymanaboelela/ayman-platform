import './styles/linkhub.css';

/**
 * The bio-link shell — one page, `/links`, and deliberately almost nothing else.
 *
 * ## Why this is not a route under `(site)`
 *
 * Three of the four things `(site)/layout.tsx` mounts are actively wrong here,
 * and the fourth is redundant:
 *
 *   · `<SiteFooter />` renders the SAME five social icons this page's rows are
 *     made of. A link-in-bio page whose footer repeats every link in its body
 *     reads as a page nobody finished.
 *   · `<SplashCursorMount />` is a continuous WebGL fluid simulation, and
 *     `<SmoothScroll />` is Lenis. This is the one page in the product that is
 *     opened cold, on mobile data, by someone who tapped a link in a YouTube
 *     description — the page where the first paint is the whole product's first
 *     impression. Both self-disable on coarse pointers, but they are still
 *     JavaScript that has to arrive and decide that.
 *   · `<SiteNav />` is a second, competing set of destinations pinned over a
 *     page whose entire content is destinations.
 *
 * What is NOT lost by leaving the group: the fonts, `dir="rtl"`, the theme
 * attribute and the whole `--n-*` / `--p-*` / `--ink*` token set all come from
 * the ROOT layout and `globals.css`, which wrap every group. This surface
 * therefore declares only its own semantic layer — see `styles/linkhub.css` —
 * exactly as `.site` does, and cannot drift from the ramps the rest of the
 * product reads.
 *
 * ## The cost of being a group, paid deliberately
 *
 * A route group with its own `layout.tsx` must also carry its own `error.tsx`
 * (`lib/error-boundary-coverage.test.ts` discovers groups rather than listing
 * them, so this one was covered the moment it existed). That is one file, and
 * it is the right trade for a page that must not ship a WebGL context to a
 * student on 3G.
 */
export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="linkhub">
      {/*
        The stage art lives HERE and not in the page, and that is a positioning
        fact rather than a tidiness one. Both layers are `position: absolute`
        with a negative inline inset, so they resolve against the nearest
        positioned ancestor — and inside the page that ancestor is
        `.linkhub__page`, a 30rem column centred in the viewport. On a phone the
        column IS the viewport and it looked correct; on a 1440px desktop the
        glow became an 860px rectangle with two hard vertical edges down the
        page.

        Anchored to `.linkhub`, which is full width, they span the viewport at
        every size. Mounting them once here also means the loading skeleton and
        the error screen sit on the same background as the page they replace,
        instead of each carrying a copy that has to be kept in sync.

        See `styles/linkhub.css` §1 for what they are made of.
      */}
      <div className="linkhub__stage" aria-hidden="true" />
      <div className="linkhub__bloom" aria-hidden="true" />
      {children}
    </div>
  );
}
