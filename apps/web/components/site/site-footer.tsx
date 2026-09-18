import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { SOCIAL_MARKS, SocialIcon, type SocialKey } from '@/components/site/social-icons';
import { FooterDragons } from '@/components/site/footer-dragons';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { TENANT_CONTACT_FALLBACK } from '@/lib/tenant-contact';
import { tenantName } from '@/lib/tenant';
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
 * ## The fallback is per-DEPLOYMENT, not shipped
 *
 * There used to be `SOCIAL_FALLBACK = OFFICIAL_PROFILES` — Ayman's accounts,
 * shipped in the image. That is correct for exactly one deployment; on anybody
 * else's it publishes HIS four accounts on their domain, and nothing looks
 * broken, which is the worst kind of wrong.
 *
 * Removing it outright was also wrong, and shipped: `getPublicSettingsOrDefaults()`
 * answers `contact: {}` when the API is unreachable, `next build` runs with no
 * API, and this footer is prerendered — so the first request after every deploy
 * got an `<h2>تابعني</h2>` above an EMPTY list on every marketing page.
 *
 * `TENANT_CONTACT_FALLBACK` is the version that is right in both directions:
 * Ayman's stack still renders his accounts during that window, and any other
 * stack renders its own or nothing at all. See its own header.
 */

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
  // ⚠️ `tenantName`, because `aboutPageTitle` IS the name — literally the
  // string «أيمن أبو العلا» and nothing else (`copy/ar.ts:1495`). The anchor
  // text is deliberately a person's name rather than «عن المنصة» so it matches
  // the query the page answers; on a second instructor's stack that reasoning
  // holds exactly as written, with a different person in it.
  { href: '/about', label: tenantName(c.aboutPageTitle) },
  // `/links` is reached almost entirely from OUTSIDE — it is the URL in four
  // bios — so it would otherwise be an orphan on this site: in the sitemap,
  // linked by nothing. That is the shape `/about`'s note above describes, and
  // it is worth one row here for the same reason.
  { href: '/links', label: copy.linkhub.pageTitle },
  // «نيوز» is the section that exists to be FOUND — it ranks for curriculum
  // queries the catalogue never will. Until this row it was reachable from
  // `/links` alone: in the sitemap, linked by one page, which is the orphan
  // shape both notes above describe and the worst possible position for the
  // one section whose entire job is search. The anchor text is the phrase
  // people type, not the section's name — see `copy.news.footerLink`.
  { href: '/news', label: copy.news.footerLink },
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
   * Every row comes from the setting, and a row with no destination is
   * DROPPED — never a bare platform root. An icon that links to
   * `https://www.tiktok.com/` is worse than no icon: it looks like a working
   * link, and the student who taps it lands on a stranger's feed. The WhatsApp
   * channel has always been in this list; the other four joined it when the
   * shipped fallback was removed, for the reason in the docblock above.
   */
  const social = (
    [
      { key: 'youtube', href: contact.youtube ?? TENANT_CONTACT_FALLBACK.youtube, label: c.footerYoutube },
      { key: 'instagram', href: contact.instagram ?? TENANT_CONTACT_FALLBACK.instagram, label: c.footerInstagram },
      { key: 'facebook', href: contact.facebook ?? TENANT_CONTACT_FALLBACK.facebook, label: c.footerFacebook },
      { key: 'tiktok', href: contact.tiktok ?? TENANT_CONTACT_FALLBACK.tiktok, label: c.footerTiktok },
      { key: 'whatsapp', href: contact.whatsappChannel ?? TENANT_CONTACT_FALLBACK.whatsappChannel, label: c.footerWhatsappChannel },
    ] satisfies { key: SocialKey; href: string | null; label: string }[]
  ).flatMap(({ key, href, label }) => (href ? [{ key, href, label }] : []));

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
            {PAGE_LINKS.map((link) => (
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
