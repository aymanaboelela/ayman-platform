import { Suspense } from 'react';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
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
