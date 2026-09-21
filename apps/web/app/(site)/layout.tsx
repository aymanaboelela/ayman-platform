import { Suspense } from 'react';
import { IS_AYMAN } from '@/lib/tenant';
import { AgentDiscoveryLinks } from '@/components/agents/agent-discovery-links';
import { WebMcpProvider } from '@/components/agents/webmcp-provider';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { DotGridSpotlight } from '@/components/dot-grid-spotlight';
import { BlankPageProbe } from '@/components/site/blank-page-probe';
import { SplashCursorMount } from '@/components/site/splash-cursor-mount';
import { SiteNav } from '@/components/site/site-nav';
import { SiteAccountSlot, SiteAccountSlotFallback } from '@/components/site/site-account-slot';
import { SiteBrandSlot, SiteBrandSlotFallback } from '@/components/site/site-brand-slot';
import { SiteFooter } from '@/components/site/site-footer';
import { SpecularButtons } from '@/components/site/specular-buttons';
import './styles/theme.css';
import './styles/media.css';
import './styles/sections.css';
import './styles/blocks.css';
import './styles/pages.css';
// ⚠️ After `sections.css`. It answers `data-layout` on the landing page's
// `<main>` and must win over the rules there without reaching for
// `!important`.
import './styles/layouts.css';
import './styles/books.css';
// ⚠️ GENUINELY LAST, and after `books.css` rather than merely after
// `layouts.css`. This is the CSS for the two landing pages that are NOT
// Ayman's (`landingPreset` = `neon` / `board`), and a preset page renders the
// book strip like any other block — so it has to be able to restyle `.book-*`
// without an `!important`, which it cannot do from above the file that
// declares them. Every rule inside is scoped to its own preset root; see that
// file's header for why a single unscoped selector there would change Ayman's
// live page.
import './styles/presets.css';
import { AssistantSlot } from '@/components/assistant/assistant-slot';

/**
 * The public marketing shell: landing, catalog, year listings, essentials.
 *
 * The momentum scrolling and the specular buttons are deliberately absent from
 * `(app)` and `(admin)` — inertia under a graded quiz attempt or a long admin
 * table is a liability. The PALETTE is no longer a difference: `.site` now
 * picks roles out of the same `--n-*` / `--p-*` ramps the product reads, so
 * the two surfaces cannot disagree about what a background or a border is.
 *
 * ⚠️ Deliberately NOT `async`. Reading the session here would block every
 * transition into this group on a `/api/session` round-trip with the previous
 * page still mounted — the failure `(app)/layout.tsx` documents at length.
 * The nav's account state streams in from its own Suspense boundary instead.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      {/*
        The atmosphere layers, moved down here from the ROOT layout.

        They used to mount on every route in the product. The pointer-trail
        fluid is a continuous WebGL simulation — it ran behind the dashboard,
        behind the admin tables, and behind a timed graded quiz attempt, on
        every page view, for the whole session. The root layout's own comment
        anticipated this exactly: "if it proves distracting during a graded
        quiz attempt, or too costly on the admin tables, move this mount down
        into `app/(site)/layout.tsx`". It did, on both counts.

        The dot grid and its cursor spotlight follow for the second reason
        rather than the first: they are cheap, but they are MOVEMENT behind a
        student answering an exam question, and a working surface should hold
        still. The signed-in surfaces get `.app-bloom` instead — one static
        gradient, no JavaScript at all.

        Both self-disable under reduced motion and on coarse pointers, so
        neither has ever run on a phone.
      */}
      {/*
        Renders nothing. Offers this site's catalog to an in-browser agent as
        callable tools where the browser supports WebMCP, and is inert
        everywhere else — see the component for why it is on the public shell
        and not on the signed-in ones.
      */}
      <WebMcpProvider />

      {/*
        The discovery relations that used to be a `Link` response header, as
        elements React hoists into `<head>`. The header grew by one copy of
        itself per cache revalidation until it passed 16KB and took the site
        down — see the component for the measurements.

        On the public shell only, which is exactly where the header was applied
        too: a signed-in surface carries `X-Robots-Tag: noindex, nofollow`, and
        pointing an agent at an API catalog from a page we are simultaneously
        asking it not to look at is a contradiction.
      */}
      <AgentDiscoveryLinks />

      <div className="dot-grid" aria-hidden="true" />
      <DotGridSpotlight />
      {/*
        ⚠️ A WebGL fluid simulation, on HIS stack only.

        `<SplashCursorMount />` is a continuous full-viewport WebGL canvas — it
        compiles shaders, holds a GL context and runs a simulation for as long
        as the page is open. It is Ayman's ambient signature and it is worth its
        cost on his page.

        On another instructor's it is worth nothing at all, and it is not free:
        it is the single heaviest thing this layout mounts, it runs on the phone
        of a student on Egyptian mobile data, and its colour is a hard-coded
        orange that is not even the tenant's hue (`splash-cursor-mount.tsx`).
        Every stack was paying for an effect that belongs to somebody else's
        brand.

        Gated at the MOUNT, not inside the component: the point is that the
        chunk is never loaded and no context is ever created, which a `return
        null` inside a client component does not buy.
      */}
      {IS_AYMAN ? <SplashCursorMount /> : null}

      <SmoothScroll />
      {/* Watches for the reported white page — laid out, full of text, painting
          none of it — and files what it finds on /admin/errors. It is here
          rather than beside a suspect because nothing has been convicted yet;
          see the component for the four causes already ruled out. */}
      <BlankPageProbe />
      {/* One delegated listener for every `.site-btn` on the surface — see the
          component for why this is not a per-button wrapper. */}
      <SpecularButtons />
      <SiteNav
        accountSlot={
          <Suspense fallback={<SiteAccountSlotFallback />}>
            <SiteAccountSlot />
          </Suspense>
        }
        /*
          The instructor's own mark, on the same contract as `accountSlot`
          above and for the same reason: this layout is deliberately not
          `async` (see the docblock), and `<SiteNav>` is `'use client'`, so a
          settings read can only reach the header as an already-rendered node.

          Its fallback is not a skeleton — it is this header's previous markup
          exactly, so nothing shifts when the boundary resolves. See
          `<SiteBrandSlotFallback>`.
        */
        brandSlot={
          <Suspense fallback={<SiteBrandSlotFallback />}>
            <SiteBrandSlot />
          </Suspense>
        }
      />
      {children}
      {/*
        ONE footer, and which one it is gets decided inside `<SiteFooter>`
        rather than here.

        `neon` and `board` render their own (`presets/neon/neon-footer.tsx`
        and `presets/board/board-footer.tsx`), chosen the same way `page.tsx`
        chooses the landing page — an `await import()`
        per preset, `classic` reaching its markup by falling through. The
        branch is not in this file because this layout is deliberately NOT
        `async` (see the docblock above, and `(app)/layout.tsx` for the
        transition it costs); `<SiteFooter>` already awaits its loaders, so the
        preset read is one more entry in a `Promise.all` it was running anyway.

        Keeping the mount singular is also what keeps `agent-discovery.e2e.ts`
        true: it asserts the delivered HTML carries exactly one `<footer>`, so
        a preset footer must REPLACE this one and never render beside it.
      */}
      <SiteFooter />
      {/*
        المساعد. Mounted per ROUTE GROUP, not at the root — and that is a
        boundary, not a preference.

        At the root it also rendered on the NOT-FOUND tree, which is the SAME
        tree Next renders when `(admin)/layout.tsx` calls `notFound()` on a
        student who reached `/admin/*`. The only difference between the two
        was `usePathname()`, so the launcher appeared on one and not the
        other — and `admin-publish-course.e2e.ts` caught it within a minute:
        that test asserts a student probing `/admin` gets output byte-identical
        to a route that does not exist, precisely so "forbidden" cannot be told
        apart from "absent". A visible button is a difference.

        Route-group layouts do not wrap that root tree, so mounting
        here means neither 404 carries the widget. `(admin)` has no mount at
        all — the instructor does not message himself.

        `<Suspense>` is REQUIRED: the widget reads `useSearchParams()` (a reply
        notification links to `?assistant=1`), and under `cacheComponents: true`
        an unsuspended search-param read makes every prerendered page a build
        error. `null` for a fallback — it renders nothing until hydration.
      */}
      <Suspense fallback={null}>
        <AssistantSlot />
      </Suspense>
    </div>
  );
}
