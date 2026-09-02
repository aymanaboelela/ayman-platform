import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon, type SocialKey } from '@/components/site/social-icons';
import { FooterDragons } from '@/components/site/footer-dragons';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { OFFICIAL_PROFILES } from '@ayman/contracts/site-profiles';
import { waMeHref } from '@ayman/contracts/whatsapp';

const c = copy.landing;

/**
 * The instructor's real profiles, as the FALLBACK for a dashboard field that
 * has not been filled in.
 *
 * These four were `https://www.youtube.com/`, `https://www.facebook.com/`,
 * `https://www.tiktok.com/` and `https://www.whatsapp.com/` — every social
 * icon in the footer sent a student to a platform's own front page instead of
 * to him. Same URLs as `SAME_AS` in `lib/seo/jsonld.ts`, and they have to stay
 * that way: `sameAs` asserts to a crawler that this site and those profiles
 * are one entity, and a footer that links somewhere else quietly contradicts
 * the claim.
 *
 * ## Why these are still here now that `ContactSchema` holds them
 *
 * A default, not a duplicate. `site_settings.data` starts empty and every
 * contact field defaults to `null`, so a footer that read ONLY from settings
 * would ship with no social links at all until someone typed five URLs into
 * the dashboard — replacing "links to the wrong place" with "links nowhere",
 * which is not an improvement. Whatever the admin saves wins; this is what the
 * site says about itself in the meantime.
 */
const SOCIAL_FALLBACK = OFFICIAL_PROFILES;

const PAGE_LINKS = [
  { href: '/', label: c.footerHome },
  { href: '/courses', label: c.coursesCta },
  { href: '/essentials', label: c.trackEssentialsTitle },
  // «الكتب». Linked from every page for the reason `/about` gives below —
  // otherwise it is a sitemap entry nothing points at — and directly under the
  // catalogue, because the two are the same question asked about two products.
  { href: '/books', label: copy.books.pageTitle },
  // `/about` is linked from every page in the site because that is how it gets
  // crawled and weighted at all — a page in the sitemap that nothing links to
  // reads as an orphan. The label is his NAME rather than «عن المنصة», so the
  // anchor text matches the query it exists to answer.
  { href: '/about', label: c.aboutPageTitle },
  // `/links` is reached almost entirely from OUTSIDE — it is the URL in four
  // bios — so it would otherwise be an orphan on this site: in the sitemap,
  // linked by nothing. That is the shape `/about`'s note above describes, and
  // it is worth one row here for the same reason.
  { href: '/links', label: copy.linkhub.pageTitle },
] as const;

const YEAR_LINKS = [
  { href: '/years/1', label: c.trackYear1Title },
  { href: '/years/2', label: c.trackYear2Title },
] as const;

const ACCOUNT_LINKS = [
  { href: '/register', label: c.footerRegister },
  { href: '/login', label: c.footerLogin },
  // In the ACCOUNT column, beside register and log in, because that is where
  // they are load-bearing: the two links sit next to the buttons that lead to
  // the form asking a student for their phone number and, optionally, both
  // parents'. A visitor deciding whether to hand that over can read who is
  // asking without leaving the decision.
  //
  // Reachable from every page is the requirement, not merely present — Google
  // flagged this site under «الصفحات المضلّلة» (social engineering) on
  // 2026-08-06 with no sample URLs, and the only structural difference between
  // this platform and one that would not be flagged was that nothing on it
  // said who collects the data or why. A policy nothing links to fixes
  // nothing.
  { href: '/privacy', label: copy.legal.privacyTitle },
  { href: '/terms', label: copy.legal.termsTitle },
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
export async function SiteFooter() {
  const { contact } = await getPublicSettingsOrDefaults();

  /*
   * Dashboard value first, shipped profile second, and the entry DROPPED if
   * neither exists — never a bare platform root. An icon that links to
   * `https://www.tiktok.com/` is worse than no icon: it looks like a working
   * link, and the student who taps it lands on a stranger's feed.
   */
  const social: { key: SocialKey; href: string; label: string }[] = [
    { key: 'youtube', href: contact.youtube ?? SOCIAL_FALLBACK.youtube, label: c.footerYoutube },
    {
      key: 'instagram',
      href: contact.instagram ?? SOCIAL_FALLBACK.instagram,
      label: c.footerInstagram,
    },
    { key: 'facebook', href: contact.facebook ?? SOCIAL_FALLBACK.facebook, label: c.footerFacebook },
    { key: 'tiktok', href: contact.tiktok ?? SOCIAL_FALLBACK.tiktok, label: c.footerTiktok },
    // No fallback: a WhatsApp CHANNEL is not something this repo knows the URL
    // of, and the placeholder it used to carry (`https://www.whatsapp.com/`)
    // was the exact failure described above.
    ...(contact.whatsappChannel
      ? [
          {
            key: 'whatsapp' as SocialKey,
            href: contact.whatsappChannel,
            label: c.footerWhatsappChannel,
          },
        ]
      : []),
  ];

  /*
   * `wa.me/<number>` built from the stored phone. This link was
   * `https://wa.me/` with no number at all: it opened WhatsApp's marketing
   * page, and the «كلّمنا» button beside it had never once started a
   * conversation — which is why `waMeHref` answers `null` rather than a
   * numberless URL when the setting is empty.
   */
  const whatsappHref = waMeHref(contact.whatsapp);

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
        <span className="site-footer__watermark" aria-hidden="true">
          {copy.site.name}
        </span>
      </div>
    </footer>
  );
}
