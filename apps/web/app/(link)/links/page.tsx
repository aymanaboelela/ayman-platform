import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  BadgeCheck,
  BookMarked,
  BookOpen,
  ChevronLeft,
  GraduationCap,
  Newspaper,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { copy } from '@ayman/contracts';
import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_CHANNEL,
  OFFICIAL_WHATSAPP_E164,
} from '@ayman/contracts/site-profiles';
import { waMeHref } from '@ayman/contracts/whatsapp';
import {
  SOCIAL_MARKS,
  SocialIcon,
  inkBrand,
  type SocialKey,
} from '@/components/site/social-icons';
import { JsonLd } from '@/components/seo/json-ld';
import { getBrandAsset } from '@/lib/brand-assets';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { getPublicSettingsOrDefaults } from '@/lib/settings';

const c = copy.linkhub;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    /*
     * «كل اللينكات», NOT the bare name. `/about` exists to win a search for
     * «أيمن أبو العلا» and its whole docblock is about not competing with the
     * homepage for that query; a second page titled with the same three words
     * would put this site in a three-way race against itself. The `<h1>` below
     * IS the name, because a profile card that does not lead with whose it is
     * is not a profile card — but the SERP entry says what the page is for.
     */
    title: c.pageTitle,
    description: c.description,
    path: '/links',
  });
}

/**
 * `/links` — the one URL that goes in a bio.
 *
 * ## Why this page exists at all when the footer already lists these
 *
 * YouTube, Instagram, TikTok and Facebook each allow the creator ONE link. The
 * homepage is the wrong thing to spend it on: someone arriving from a TikTok
 * comment is usually not there to enrol, they are there to check that the
 * account they just watched is the same person as the platform being
 * advertised — and to find the next platform. A landing page answers the first
 * question in three scrolls and the second one in the footer.
 *
 * So the trade this page makes, deliberately, is breadth over depth: every
 * destination the project has, one tap from the top of the viewport, with the
 * platform itself as the only thing styled as a call to action.
 *
 * ## Where the links come from, and why not from here
 *
 * Settings first, the contract constants as the backstop — the exact shape
 * `site-footer.tsx` established and for the reasons written there: the
 * settings row starts empty, so reading settings alone would ship a page with
 * no links on it, and reading the constants alone would make this the one
 * surface that ignores what an admin typed into `/admin/settings`.
 *
 * `getPublicSettingsOrDefaults()` and never `getPublicSettings()`: this page is
 * prerendered, the throwing variant fails `next build`, and `next build` runs
 * inside `docker build` where no API is listening.
 *
 * ## The rows that are missing on purpose
 *
 * `telegram`, `facebookGroup`, `whatsappGroup` and `email` have no fallback
 * constant, because this repository does not know them and a guessed contact
 * detail sends a student to somebody else. They render when an admin fills
 * them in and are absent until then — never as a link to a platform's own
 * homepage, which is the specific bug `site-profiles.ts` was created to end.
 */
export default async function LinksPage() {
  const { contact } = await getPublicSettingsOrDefaults();

  const profiles = {
    youtube: contact.youtube ?? OFFICIAL_PROFILES.youtube,
    instagram: contact.instagram ?? OFFICIAL_PROFILES.instagram,
    tiktok: contact.tiktok ?? OFFICIAL_PROFILES.tiktok,
    facebook: contact.facebook ?? OFFICIAL_PROFILES.facebook,
  };

  const whatsappChannel = contact.whatsappChannel ?? OFFICIAL_WHATSAPP_CHANNEL;
  /* `waMeHref` strips the leading `+` and changes nothing else — `wa.me`
     rejects the E.164 form. Nullable, because a stored number that is somehow
     not E.164 must drop the row rather than render a link to WhatsApp's
     marketing page; `OFFICIAL_WHATSAPP_E164` means that in practice never
     happens. */
  const whatsappChat = waMeHref(contact.whatsapp ?? OFFICIAL_WHATSAPP_E164);

  const social: SocialRow[] = [
    { key: 'youtube', href: profiles.youtube, label: copy.landing.footerYoutube },
    { key: 'instagram', href: profiles.instagram, label: copy.landing.footerInstagram },
    { key: 'tiktok', href: profiles.tiktok, label: copy.landing.footerTiktok },
    { key: 'facebook', href: profiles.facebook, label: copy.landing.footerFacebook },
  ];

  const avatar = getBrandAsset('mark');

  return (
    <main className="linkhub__page">
      {/*
        NOT a second `personJsonLd()`. `(site)/layout.tsx` emits the full
        `Person` — with `sameAs` already listing these four profiles — on every
        page of the marketing surface, and this page is outside that group, so
        the entity is not restated here either: `/about` is the page that
        declares itself the subject of that entity, and two pages claiming it
        would be two `ProfilePage`s for one person.

        The breadcrumb is the one thing genuinely true of this URL and nowhere
        else, so it is the one thing emitted.
      */}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: c.pageTitle, path: '/links' },
        ])}
      />

      <header className="linkhub__head" style={{ '--lh-i': 0 } as React.CSSProperties}>
        {avatar ? (
          <div className="linkhub__avatar">
            {/*
              `priority` and `fetchPriority="high"`: this is the LCP element on
              a page that is opened cold from another platform's app browser,
              and `fetchPriority` is a SEPARATE switch Next does not derive from
              `priority` — without it the preload queues at Low.

              `sizes="112px"` matches the rendered box exactly. The source is
              128×128, so a 2× phone gets the file as-is and nothing is
              upscaled; asking for more than the box would fetch bytes no
              screen can show.
            */}
            <Image
              src={avatar.src}
              width={avatar.width}
              height={avatar.height}
              alt={copy.site.instructor}
              priority
              fetchPriority="high"
              sizes="112px"
            />
          </div>
        ) : null}

        <h1 className="linkhub__name">{c.title}</h1>
        <p className="linkhub__role">{c.role}</p>

        <span className="linkhub__verified">
          <BadgeCheck size={14} aria-hidden="true" />
          {c.verified}
        </span>

        <p className="linkhub__lead">{c.lead}</p>
      </header>

      <section
        className="linkhub__group"
        aria-labelledby="linkhub-platform"
        style={{ '--lh-i': 1 } as React.CSSProperties}
      >
        <h2 className="linkhub__group-label" id="linkhub-platform">
          {c.groupPlatform}
        </h2>
        <ul className="linkhub__list">
          <Row
            href="/courses"
            internal
            primary
            icon={<GraduationCap size={20} aria-hidden="true" />}
            title={c.coursesTitle}
            note={c.coursesNote}
          />
          <Row
            href="/register"
            internal
            icon={<Sparkles size={20} aria-hidden="true" />}
            title={c.registerTitle}
            note={c.registerNote}
          />
          {/*
            «اطلب الكتاب» — above «التأسيس» and directly under «سجّل», because
            it is the only row on this page that leads to a transaction. Someone
            who arrived from a TikTok comment asking «الكتاب بيتباع فين؟» should
            not have to scroll past a glossary to find out.
          */}
          <Row
            href="/books"
            internal
            icon={<BookMarked size={20} aria-hidden="true" />}
            title={c.booksTitle}
            note={c.booksNote}
          />
          <Row
            href="/essentials"
            internal
            icon={<BookOpen size={20} aria-hidden="true" />}
            title={c.essentialsTitle}
            note={c.essentialsNote}
          />
          <Row
            href="/news"
            internal
            icon={<Newspaper size={20} aria-hidden="true" />}
            title={c.newsTitle}
            note={c.newsNote}
          />
          <Row
            href="/about"
            internal
            icon={<UserRound size={20} aria-hidden="true" />}
            title={c.aboutTitle}
            note={c.aboutNote}
          />
        </ul>
      </section>

      <section
        className="linkhub__group"
        aria-labelledby="linkhub-follow"
        style={{ '--lh-i': 2 } as React.CSSProperties}
      >
        <h2 className="linkhub__group-label" id="linkhub-follow">
          {c.groupFollow}
        </h2>
        <ul className="linkhub__list">
          {social.map((row) => {
            const mark = SOCIAL_MARKS[row.key];
            return (
              <Row
                key={row.key}
                href={row.href}
                brand={inkBrand(mark)}
                icon={<SocialIcon mark={mark} />}
                title={row.label}
                /*
                  The handle, read off the href rather than written into the
                  copy table — see `copy.linkhub`'s docblock. On a page whose
                  entire claim is «دي حساباته الرسمية», a handle that disagrees
                  with the link under it is the one error that matters.
                */
                note={handleOf(row.href)}
                noteIsHandle
              />
            );
          })}
        </ul>
      </section>

      <section
        className="linkhub__group"
        aria-labelledby="linkhub-talk"
        style={{ '--lh-i': 3 } as React.CSSProperties}
      >
        <h2 className="linkhub__group-label" id="linkhub-talk">
          {c.groupTalk}
        </h2>
        <ul className="linkhub__list">
          <Row
            href={whatsappChannel}
            brand={inkBrand(SOCIAL_MARKS.whatsapp)}
            icon={<SocialIcon mark={SOCIAL_MARKS.whatsapp} />}
            title={c.whatsappChannelTitle}
            note={c.whatsappChannelNote}
          />
          {whatsappChat ? (
            <Row
              href={whatsappChat}
              brand={inkBrand(SOCIAL_MARKS.whatsapp)}
              icon={<SocialIcon mark={SOCIAL_MARKS.whatsapp} />}
              title={c.whatsappTitle}
              note={c.whatsappNote}
            />
          ) : null}
          {/* No fallback exists for these two, and inventing one would send a
              student to a stranger's group. Absent until an admin fills them
              in at `/admin/settings`. */}
          {contact.facebookGroup ? (
            <Row
              href={contact.facebookGroup}
              brand={inkBrand(SOCIAL_MARKS.facebook)}
              icon={<SocialIcon mark={SOCIAL_MARKS.facebook} />}
              title={c.facebookGroupTitle}
              note={c.facebookGroupNote}
            />
          ) : null}
          {contact.telegram ? (
            <Row
              href={contact.telegram}
              icon={<Sparkles size={20} aria-hidden="true" />}
              title={c.telegramTitle}
              note={c.telegramNote}
            />
          ) : null}
        </ul>
      </section>

      <footer className="linkhub__foot" style={{ '--lh-i': 4 } as React.CSSProperties}>
        <Link className="linkhub__foot-link" href="/">
          {c.site}
        </Link>
        <p className="linkhub__rights">{copy.landing.footerRights}</p>
      </footer>
    </main>
  );
}

type SocialRow = { key: SocialKey; href: string; label: string };

/**
 * The account name inside a profile URL — `@2ayman6` for the YouTube channel,
 * `aymanaboelela2` for the Facebook page.
 *
 * Derived rather than stored, so it cannot disagree with the `href` beside it.
 * Returns an empty string for anything it does not recognise as a profile path
 * (a `wa.me` action, a channel invite), and the row then renders no second
 * line at all rather than a fragment of a URL.
 */
function handleOf(href: string): string {
  try {
    const segments = new URL(href).pathname.split('/').filter(Boolean);
    const last = segments.at(-1) ?? '';
    return last && last.length <= 40 ? (last.startsWith('@') ? last : `@${last}`) : '';
  } catch {
    return '';
  }
}

/**
 * One destination.
 *
 * `internal` picks `<Link>` over `<a>`: the platform rows stay inside the app
 * and should prefetch, while every off-site row is a plain anchor with
 * `rel="noopener noreferrer"` and a new tab — a student who taps «يوتيوب» from
 * a Facebook in-app browser and then wants the WhatsApp channel should still
 * have this page behind them.
 */
function Row({
  href,
  title,
  note,
  icon,
  brand,
  internal = false,
  primary = false,
  noteIsHandle = false,
}: {
  href: string;
  title: string;
  note: string;
  icon: React.ReactNode;
  brand?: string;
  internal?: boolean;
  primary?: boolean;
  noteIsHandle?: boolean;
}) {
  const className = `linkhub__row${primary ? ' linkhub__row--primary' : ''}`;
  const style = brand ? ({ '--brand': brand } as React.CSSProperties) : undefined;

  const body = (
    <>
      <span className="linkhub__tile">{icon}</span>
      <span className="linkhub__text">
        <span className="linkhub__title">{title}</span>
        {note ? (
          <span className={noteIsHandle ? 'linkhub__handle' : 'linkhub__note'}>{note}</span>
        ) : null}
      </span>
      {/*
        `ChevronLeft`, unflipped. The document is `dir="rtl"`, so "onward" is
        toward the left edge and this glyph already points there — the
        `.icon-inline` mirror helper would send it backwards.
      */}
      <ChevronLeft size={18} className="linkhub__chev" aria-hidden="true" />
    </>
  );

  return (
    <li>
      {internal ? (
        <Link className={className} style={style} href={href}>
          {body}
        </Link>
      ) : (
        <a
          className={className}
          style={style}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {body}
          <span className="sr-only">{c.opens}</span>
        </a>
      )}
    </li>
  );
}
