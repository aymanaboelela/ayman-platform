import { Suspense } from 'react';
import { WebMcpProvider } from '@/components/agents/webmcp-provider';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { DotGridSpotlight } from '@/components/dot-grid-spotlight';
import { SplashCursorMount } from '@/components/site/splash-cursor-mount';
import { SiteNav } from '@/components/site/site-nav';
import { SiteAccountSlot, SiteAccountSlotFallback } from '@/components/site/site-account-slot';
import { SiteFooter } from '@/components/site/site-footer';
import { SpecularButtons } from '@/components/site/specular-buttons';
import './styles/theme.css';
import './styles/media.css';
import './styles/sections.css';
import './styles/blocks.css';
import './styles/pages.css';

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

      <div className="dot-grid" aria-hidden="true" />
      <DotGridSpotlight />
      <SplashCursorMount />

      <SmoothScroll />
      {/* One delegated listener for every `.site-btn` on the surface — see the
          component for why this is not a per-button wrapper. */}
      <SpecularButtons />
      <SiteNav
        accountSlot={
          <Suspense fallback={<SiteAccountSlotFallback />}>
            <SiteAccountSlot />
          </Suspense>
        }
      />
      {children}
      <SiteFooter />
    </div>
  );
}
