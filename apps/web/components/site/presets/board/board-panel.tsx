import Image from 'next/image';
import Link from 'next/link';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import { mediaUrl } from '@ayman/ui/branding';
import { BoardMark } from './board-mark';

/**
 * The opener of «اللوح»: one solid block of the brand colour with a curved
 * bottom edge, everything centred inside it, and the tenant's mark standing in
 * the bottom of it.
 *
 * It renders the `hero` block — the same stored row `<SiteHero>` renders on
 * `classic` — and every field on that row is used or has a comment below
 * saying why it is not.
 *
 * ## It carries `data-site-hero`, and that is not a copy-paste
 *
 * `<SiteNav>` (rendered by `app/(site)/layout.tsx`, above every page in this
 * group) starts TRANSPARENT on `/` and flips to a solid card once the reader
 * has scrolled one header-height past `[data-site-hero]`. With no such element
 * the effect calls `setPinned(true)` immediately — so the header would render
 * transparent in the server HTML, then snap to a card on hydration, on top of
 * this panel. A visible jump on the first paint of the first screen.
 *
 * The attribute's own rule — «nothing else may claim it; a second one makes
 * the header flip against whichever is first in document order» — is about TWO
 * of them on one page. There cannot be two here: `<SiteHero>` is only reached
 * from the `classic` arm of `app/(site)/page.tsx`, and that arm never runs when
 * this component does. Within this page this panel is the only claimant, and
 * it is the correct one: it is the lit stage the header is meant to sit over.
 *
 * ⚠️ If a future change renders more than one `hero` block on this preset, the
 * attribute must stay on the first. `board-landing.tsx` already distinguishes
 * them for the `<h1>`; see the note there.
 *
 * ## The panel does not follow `data-theme`, and neither do the year tiles
 *
 * `--board-slab` resolves to `--p-900`, and the eleven `--p-*` steps are
 * declared once at `:root` and are NOT redeclared in either dark block of
 * `packages/ui/src/tokens/color.css` — the ramp is theme-independent by
 * construction, including when it is generated from a tenant's own
 * `accentHue` (`rampDeclarations` emits `--p-*` on the light pass only, see
 * `packages/ui/src/lib/ramp.ts`). So the deep block is the SAME colour in both
 * themes, which is the point: it is the brand, not a surface. `classic`'s hero
 * makes exactly this argument for staying dark in both themes — «it is a lit
 * stage» — and this is the same decision with a different colour in it.
 *
 * Contrast is fixed by that too, rather than needing a second palette:
 * `--p-900` sits at OKLCH L 0.360 whatever hue it is generated from, so white
 * on it measures ≈7.5:1 for every accent an admin can choose.
 */
export function BoardPanel({
  branding,
  name,
  eyebrow,
  headline,
  subheadline,
  rotating,
  lead,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  stats,
  level,
}: {
  branding: BrandingRead;
  /** The deployment's display name, for the mark's empty state only. */
  name: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  rotating: readonly string[];
  lead: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  stats: readonly { value: string; labelAr: string }[];
  /** 1 when this panel owns the page's single `<h1>`. See `board-heading.tsx`. */
  level: 1 | 2;
}) {
  const Title = level === 1 ? 'h1' : 'h2';

  /*
   * The role line under the name.
   *
   * `rotatingAr` is the hero block's cycling second line, and this preset does
   * not cycle it — the whole page is a server component with no client
   * boundary, and `<RotatingHeadline>` is `'use client'` plus a GSAP timeline.
   * Pulling that in would put the one JavaScript bundle on this page's LCP
   * path to animate a line that an admin can equally well write once.
   *
   * Dropping the field would be a silent data loss, though: an admin who
   * cleared `subheadlineAr` and typed three rotating phrases has a hero whose
   * second line lives ONLY in that array. So the first phrase stands in — which
   * is exactly what `classic` itself renders under `prefers-reduced-motion`,
   * so it is a state that has already been designed for rather than a
   * degradation invented here.
   */
  const role = subheadline || rotating[0] || '';

  return (
    <section className="board-panel" data-site-hero>
      <div className="board-panel__inner">
        {eyebrow ? <span className="board-chip board-chip--on-slab">{eyebrow}</span> : null}

        <Title className="board-panel__title">{headline}</Title>

        {role ? <p className="board-panel__role">{role}</p> : null}
        {lead ? <p className="board-panel__lead">{lead}</p> : null}

        {ctaLabel || secondaryCtaLabel ? (
          <div className="board-panel__cta">
            {/*
              The house buttons, unchanged. `--light` is a white fill with
              near-black text and `--on-ink` is a white hairline outline — both
              are written for a permanently dark panel in `theme.css`, which is
              precisely what this is, and both already get the specular
              highlight from `<SpecularButtons>` in the site layout. Restyling
              them here would be a second, drifting definition of the one
              button this platform has.
            */}
            {ctaLabel ? (
              <Link className="site-btn site-btn--light" href={ctaHref}>
                {ctaLabel}
              </Link>
            ) : null}
            {secondaryCtaLabel ? (
              <Link className="site-btn site-btn--on-ink" href={secondaryCtaHref}>
                {secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        ) : null}

        {/*
          The hero's own figures. Empty on both shipped block lists, so this
          normally renders nothing at all — but the field is admin-editable
          from /admin/home and a block that carries four numbers must not drop
          them just because this preset was not designed around them. They land
          as a centred rule-separated row under the buttons rather than as the
          four-column grid `classic` uses; four columns inside a panel that is
          otherwise a single centred column would be the only ranged-left thing
          on the page.
        */}
        {stats.length > 0 ? (
          <dl className="board-panel__figures">
            {stats.map((stat, index) => (
              <div className="board-panel__figure" key={`${stat.labelAr}-${index}`}>
                {/* `.tabular-nums` so a row of figures keeps its columns when
                    the digits differ in width — the same handling every other
                    number on this platform gets. */}
                <dt className="board-panel__figure-n tabular-nums">{stat.value}</dt>
                <dd className="board-panel__figure-l">{stat.labelAr}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {/*
          ⚠️ `hero.imageAssetId` is NOT read here, and it is the obvious thing
          to reach for — it is literally the hero's own picture.

          It cannot be resolved from this page. The block payload carries the
          asset's UUID and nothing else; a URL needs the row's `storage_key`,
          and the two are not interconvertible (see `BrandingReadSchema`'s note
          on exactly this bug — every admin-chosen favicon 404'd for months
          because somebody derived one from the other). The API resolves keys
          server-side for the branding payload and does not for home blocks, so
          honouring this field means either a new resolved field on
          `HomeBlockSchema` or a per-render lookup — one is a contract change
          that belongs to whoever owns that file, the other is an uncached fetch
          on the landing page's LCP path.

          `classic` does not read it either: `renderBlock` never passes it to
          `<SiteHero>`. So this preset is not dropping something the platform
          currently shows; it is declining to be the first place a half-built
          field appears to work.

          `branding.heroKey` IS resolved, and it is what stands here now: the
          instructor's own photograph, at the size the panel can give it.
        */}
        {branding.heroKey ? (
          /*
            The mark drops to a strip above the photograph when there is one.
            It used to BE the figure — a 22rem-wide logo centred in the panel —
            and that was the right answer only while there was nothing else to
            put there. A student choosing a teacher is choosing a person, and a
            mascot at hero size in front of a face that is not on the page is
            the panel arguing for the brand over the person teaching.

            `aria-hidden` on the wrapper: the name is the page's `<h1>`
            directly above, so the photograph carries no information a reader
            who cannot see it is missing.
          */
          /*
            No mark above the photograph.
            
            It was a strip here for one release, on the theory that a brand
            needs its mark on the opener. It does not: the wordmark is already
            in the header, three centimetres above, and a second copy of the
            same mascot between the headline and the face was the opener
            saying the same thing twice — which is what it looked like.
          */
          <>
            <div className="board-portrait" aria-hidden="true">
              <Image
                className="board-portrait__img"
                src={mediaUrl(branding.heroKey)}
                alt=""
                width={900}
                height={1104}
                sizes="(min-width: 48rem) 26rem, 70vw"
                priority
              />
            </div>
          </>
        ) : (
          <BoardMark branding={branding} name={name} />
        )}
      </div>
    </section>
  );
}
