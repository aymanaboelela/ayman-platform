import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { SiteNav } from '@/components/site/site-nav';
import { SiteFooter } from '@/components/site/site-footer';
import { SpecularButtons } from '@/components/site/specular-buttons';
import { DragonSprite } from '@/components/site/dragon-sprite';
import './styles/theme.css';
import './styles/media.css';
import './styles/sections.css';
import './styles/pages.css';

/**
 * The public marketing shell: landing, catalog, year listings, essentials.
 *
 * Everything here is deliberately absent from `(app)` and `(admin)` — momentum
 * scrolling under a graded quiz attempt or a long admin table is a liability,
 * and the orange marketing palette has no business overriding the product's
 * neutral surfaces.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SmoothScroll />
      {/* One delegated listener for every `.site-btn` on the surface — see the
          component for why this is not a per-button wrapper. */}
      <SpecularButtons />
      {/* Fixed to the viewport and driven by page scroll progress — it descends
          WITH the reader rather than living in one section. */}
      <DragonSprite />
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
