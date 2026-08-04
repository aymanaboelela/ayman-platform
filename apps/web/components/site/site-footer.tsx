import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon, type SocialKey } from '@/components/site/social-icons';
import { FooterDragons } from '@/components/site/footer-dragons';

const c = copy.landing;

/** Placeholder destinations until the real channels are supplied. */
const SOCIAL: { key: SocialKey; href: string; label: string }[] = [
  { key: 'youtube', href: 'https://www.youtube.com/', label: c.footerYoutube },
  { key: 'facebook', href: 'https://www.facebook.com/', label: c.footerFacebook },
  { key: 'tiktok', href: 'https://www.tiktok.com/', label: c.footerTiktok },
  { key: 'whatsapp', href: 'https://www.whatsapp.com/', label: c.footerWhatsappChannel },
];

const PAGE_LINKS = [
  { href: '/', label: c.footerHome },
  { href: '/courses', label: c.coursesCta },
  { href: '/essentials', label: c.trackEssentialsTitle },
  // `/about` is linked from every page in the site because that is how it gets
  // crawled and weighted at all — a page in the sitemap that nothing links to
  // reads as an orphan. The label is his NAME rather than «عن المنصة», so the
  // anchor text matches the query it exists to answer.
  { href: '/about', label: c.aboutPageTitle },
] as const;

const YEAR_LINKS = [
  { href: '/years/1', label: c.trackYear1Title },
  { href: '/years/2', label: c.trackYear2Title },
] as const;

const ACCOUNT_LINKS = [
  { href: '/register', label: c.footerRegister },
  { href: '/login', label: c.footerLogin },
] as const;

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
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__glow" aria-hidden="true" />

      <div className="site-shell site-footer__inner">
        <section className="footer-cta">
          <h2 className="footer-cta__title">{c.finalTitle}</h2>
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
              <span className="wordmark__name">{copy.site.name}</span>
              <span className="wordmark__tag">{copy.site.tagline}</span>
            </span>
            <p className="site-footer__blurb">{c.footerTagline}</p>

            <ul className="social" aria-label={c.footerFollow}>
              {SOCIAL.map((item) => {
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
            <h3 className="site-footer__h">{c.footerPages}</h3>
            {PAGE_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="site-footer__col" aria-label={c.tracksSelectTitle}>
            <h3 className="site-footer__h">{copy.onboarding.year}</h3>
            {YEAR_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="site-footer__col" aria-label={copy.nav.dashboard}>
            <h3 className="site-footer__h">{copy.nav.dashboard}</h3>
            {ACCOUNT_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}

            <a
              className="site-btn site-btn--outline site-footer__wa"
              href="https://wa.me/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ['--brand' as string]: SOCIAL_MARKS.whatsapp.hex }}
            >
              <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={16} />
              {c.footerWhatsapp}
            </a>

            <a
              className="site-footer__group"
              href="https://www.facebook.com/groups/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Users size={15} aria-hidden="true" />
              {c.footerCommunity}
            </a>
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
        <span className="site-footer__watermark" aria-hidden="true">
          {copy.site.name}
        </span>
      </div>
    </footer>
  );
}
