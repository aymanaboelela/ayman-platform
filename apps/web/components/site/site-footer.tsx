import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import { FooterDragons } from '@/components/site/footer-dragons';
/*
 * The link tables and the two derivations below used to live in this file.
 * They moved when `neon` and `board` grew footers of their own: a second copy
 * of «drop a social row that has no destination» or of the `features.books`
 * filter is a second place they can drift, on a stack nobody is looking at.
 * The JSX underneath is untouched — same arrays, same order, same HTML.
 */
import {
  ACCOUNT_LINKS,
  YEAR_LINKS,
  footerContent,
  footerPageLinks,
  footerSocial,
} from '@/components/site/footer-content';
import { getBranding, getPublicSettingsOrDefaults } from '@/lib/settings';
import { getEntitlements } from '@/lib/entitlements';
import { tenantName } from '@/lib/tenant';
import { waMeHref } from '@ayman/contracts/whatsapp';

const c = copy.landing;

/**
 * The footer, carrying the page's closing call to action.
 *
 * Folding the final CTA in here rather than giving it its own section is
 * deliberate: a standalone "ready to start?" band followed immediately by a
 * footer asks the visitor to scroll past the same decision twice. One block, at
 * the end, where they have already read everything.
 *
 * The wordmark repeats at the very bottom as an oversized watermark, its lower
 * third clipped by the footer's edge — it closes the page on the brand instead
 * of on a line of legal text. A dragon stands at each end of it breathing fire
 * up through the letters; see `<FooterDragons>`, which costs no download of its
 * own because it redraws the frames the tracks section already fetched.
 */
export async function SiteFooter() {
  const [{ contact }, features, branding] = await Promise.all([
    getPublicSettingsOrDefaults(),
    getEntitlements(),
    /* الثالثة مجانية عمليًا: `getBranding()` هو `'use cache'` ومتقري أصلًا في
       الروت لايوت وفي `page.tsx`، فده إدخال كاش دافي في نفس الرندر. */
    getBranding(),
  ]);

  const pageLinks = footerPageLinks(features);
  const social = footerSocial(contact);

  /*
   * `wa.me/<number>` built from the stored phone. This link was
   * `https://wa.me/` with no number at all: it opened WhatsApp's marketing
   * page, and the «كلّمنا» button beside it had never once started a
   * conversation — which is why `waMeHref` answers `null` rather than a
   * numberless URL when the setting is empty.
   */
  const whatsappHref = waMeHref(contact.whatsapp);

  /*
   * WHICH footer, decided before anything below it runs — and read as one
   * rule with `page.tsx`, which chooses the landing page the same way.
   *
   * ## Why the branch is HERE and not in `(site)/layout.tsx`
   *
   * Because that layout is deliberately not `async` and must not become one.
   * Its own docblock says why: reading anything there blocks every transition
   * into this route group on a round-trip with the previous page still
   * mounted. This component is already async and already awaiting two loaders,
   * so the preset read costs a third entry in the same `Promise.all` and
   * nothing else. The layout keeps mounting exactly one `<SiteFooter>`, which
   * is also what keeps `agent-discovery.e2e.ts` true — it asserts the shipped
   * HTML carries exactly one `<footer>`, so a preset footer must REPLACE this
   * one rather than render beside it.
   *
   * ## Why `await import()` and not a top-level import
   *
   * Identical reasoning to `page.tsx`'s, and it bites harder here: the footer
   * is on EVERY route in `(site)` plus the prerendered 404, not just on `/`.
   * A static import would evaluate both preset module graphs on every one of
   * those renders, Ayman's included, and hoist any stylesheet or client
   * component they reach into the shell — which is how `classic` acquires a
   * rule nobody wrote for it, with no diff on his own files to point at.
   *
   * `classic` falls THROUGH to the return underneath. There is no
   * `=== 'classic'` arm and there must not be one: that markup is what his
   * students are served today, and the only acceptable diff on it is none.
   */
  if (branding.landingPreset === 'neon') {
    const { default: NeonFooter } = await import('@/components/site/presets/neon/neon-footer');
    return <NeonFooter content={footerContent({ contact, features })} />;
  }

  if (branding.landingPreset === 'board') {
    const { default: BoardFooter } = await import('@/components/site/presets/board/board-footer');
    return <BoardFooter content={footerContent({ contact, features })} />;
  }

  if (branding.landingPreset === 'studio') {
    const { default: StudioFooter } = await import('@/components/site/presets/studio/studio-footer');
    return <StudioFooter content={footerContent({ contact, features })} />;
  }

  return (
    <footer className="site-footer">
      <div className="site-footer__glow" aria-hidden="true" />

      <div className="site-shell site-footer__inner">
        <section className="footer-cta">
          {/*
            ⚠️ `<p>`, not `<h2>` — and every heading was taken out of this
            footer for the same reason on 2026-09-13.

            The footer is rendered in the shell; the page's own content is
            streamed in after it. So in the HTML as delivered — which is what a
            crawler that does not run JavaScript parses, and that is most of the
            AI ones — this line came BEFORE the page's `<h1>`, followed by three
            `<h3>` column labels. A document whose first four headings are an h2
            and three h3s, with the h1 arriving fifth, fails every heading-order
            check there is; an AI-readiness scan scored the site 0/20 on it.

            Nothing was lost by demoting them. A CTA is not a section of the
            document, and each column below is a `<nav>` with an `aria-label`
            already carrying the same words — the heading was a second, weaker
            copy of a label the landmark states properly. Styling is by class in
            `sections.css`, and Tailwind's preflight zeroes the margins on both
            elements, so the rendering is byte-identical.

            Do not reintroduce a heading here. If the footer ever needs one, it
            has to come after the page content in SOURCE order, which is a
            layout change, not a tag change.
          */}
          <p className="footer-cta__title">{c.finalTitle}</p>
          <p className="footer-cta__lead">{c.finalLead}</p>
          <div className="footer-cta__actions">
            <Link className="site-btn site-btn--solid" href="/register">
              <ArrowLeft size={17} className="site-btn__arrow" aria-hidden="true" />
              {c.finalCta}
            </Link>
            <Link className="site-btn site-btn--outline" href="/courses">
              {c.coursesCta}
            </Link>
          </div>
        </section>

        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <span className="wordmark wordmark--lg">
              {/* `tenantName()`, like the nav's — the footer wordmark is the
                  other half of the same claim, rendered on every public page.
                  A page whose header says one name and whose footer says
                  «أيمن أبو العلا» is worse than either alone: it reads as a
                  platform reselling somebody else's brand. */}
              <span className="wordmark__name">{tenantName(copy.site.name)}</span>
              <span className="wordmark__tag">{copy.site.tagline}</span>
            </span>
            <p className="site-footer__blurb">{c.footerTagline}</p>

            <ul className="social" aria-label={c.footerFollow}>
              {social.map((item) => {
                const mark = SOCIAL_MARKS[item.key];
                return (
                  <li key={item.key}>
                    <a
                      className="social__link"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      title={item.label}
                      // Read by `.social__link:hover` — each button lights up
                      // in its own brand's colour instead of all four turning
                      // the same orange.
                      style={{ ['--brand' as string]: mark.hex }}
                    >
                      <SocialIcon mark={mark} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <nav className="site-footer__col" aria-label={c.footerPages}>
            <p className="site-footer__h">{c.footerPages}</p>
            {pageLinks.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="site-footer__col" aria-label={c.tracksSelectTitle}>
            <p className="site-footer__h">{copy.onboarding.year}</p>
            {YEAR_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="site-footer__col" aria-label={copy.nav.dashboard}>
            <p className="site-footer__h">{copy.nav.dashboard}</p>
            {ACCOUNT_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}

            {/* Both of these are rendered ONLY when the dashboard holds a real
                destination. They used to be unconditional and pointed at
                `https://wa.me/` and `https://www.facebook.com/groups/` — two
                buttons that looked like features and worked like dead ends. */}
            {whatsappHref ? (
              <a
                className="site-btn site-btn--outline site-footer__wa"
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ['--brand' as string]: SOCIAL_MARKS.whatsapp.hex }}
              >
                <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={16} />
                {c.footerWhatsapp}
              </a>
            ) : null}

            {contact.facebookGroup ? (
              <a
                className="site-footer__group"
                href={contact.facebookGroup}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Users size={15} aria-hidden="true" />
                {c.footerCommunity}
              </a>
            ) : null}
          </nav>
        </div>

        <div className="site-footer__bar">
          <p className="site-footer__rights">{c.footerRights}</p>
        </div>
      </div>

      {/* The pair and the wordmark share one stacking box so the flames can rise
          THROUGH the name — the dragons paint behind it, the letters on top. */}
      <div className="site-footer__signoff">
        <FooterDragons />
        {/* The giant sign-off letters behind the dragons. `aria-hidden`, so
            no screen reader ever reaches it — and gated anyway, because it is
            the single largest rendering of the name on the site and it is
            baked into the prerendered HTML, where a scraper reads it whatever
            the ARIA says. */}
        <span className="site-footer__watermark" aria-hidden="true">
          {tenantName(copy.site.name)}
        </span>
      </div>
    </footer>
  );
}
