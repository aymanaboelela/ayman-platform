import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import { copy } from '@ayman/contracts/copy';
import { getBranding } from '@/lib/settings';
import { tenantName } from '@/lib/tenant';
import { Mono, NeonCommand } from './neon-chrome';
import { neonCopy } from './neon-copy';

export interface NeonHeroProps {
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
  /** 1 unless this is a second `hero` block — see `<NeonLanding>`. */
  level: 1 | 2;
}

/**
 * The opener: the mark, a terminal line, the headline, the lead, two commands.
 *
 * Centred, on the same ground as everything below it. That is the preset's
 * whole thesis — «الترمينال» has no light sections and therefore no stage
 * either, because a stage is only a stage when something around it is not one.
 * What separates this from the section under it is a glowing hairline, not a
 * change of background.
 *
 * ## `data-site-hero`, and why leaving it off would break the header
 *
 * `<SiteNav>` (`components/site/site-nav.tsx`) probes the DOM for
 * `[data-site-hero]` and pins itself into its card state when it finds none.
 * The card is `--site-nav-card`, which under the light theme is white — so a
 * neon page WITHOUT this attribute renders a white bar across the top of a
 * page that is otherwise black, and does it only for readers whose system is
 * set to light. With the attribute the header behaves exactly as it does on
 * the landing page it was written for: transparent over the opener, a card
 * once you scroll past it. (The card is dark on this preset too — see the
 * `:has()` block in `presets.css` for how, and why it had to be done there.)
 *
 * ## The mark
 *
 * The tenant's own uploaded logo, dark variant first. NOTHING of anybody
 * else's is reachable from here: `getBrandAsset()` — the registry that holds
 * Ayman's photograph, his dragon and his monogram — is not imported, so there
 * is no code path on this page that could resolve one of his files.
 *
 * With no logo uploaded the fallback is a drawn `</>` monogram in the brand
 * colour, framed the same way the logo would be. It is a FINISHED mark and not
 * a placeholder: a brand-new instructor lands here before they have opened
 * /admin/settings, and an empty box with a border at the top of the first
 * screen their students ever see is worse than no mark at all.
 */
export async function NeonHero({
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
}: NeonHeroProps) {
  const branding = await getBranding();

  /*
   * Dark first, then light. This page never turns light, so the logo drawn
   * FOR a dark ground is the right one every time — the light variant is the
   * fallback only because a tenant who uploaded exactly one file should see it
   * rather than see the monogram.
   */
  const logoKey = branding.logoDarkKey ?? branding.logoLightKey;

  /*
   * `tenantName()` and not `copy.site.name` directly. On Ayman's own stack the
   * two are the same string, which is correct — it is his platform. On every
   * other stack this is the deployment's own display name, and his never
   * appears. That gate exists because running a non-`ayman` stack for real
   * found his name in the nav, his face in the hero and his photograph as the
   * favicon in the first screenful; see `lib/tenant.ts`.
   */
  const name = tenantName(copy.site.name);

  const Heading = level === 1 ? 'h1' : 'h2';

  /*
   * The rotation is rendered as ONE static line, and the rest of `rotatingAr`
   * is deliberately dropped.
   *
   * Cycling it needs a client component and a timer. This whole preset is
   * server-rendered with no JavaScript of its own — that is why it holds its
   * shape before hydration, on a throttled phone, and with scripts blocked —
   * and a rotating headline is not worth the first client boundary on the
   * page. Nothing is lost in MEANING either: the entries are alternative
   * phrasings of one promise (see `HeroPropsSchema.rotatingAr`), so showing
   * one says the same thing as showing all six in turn. It is only read when
   * `subheadlineAr` is empty, so an editor who filled in both still gets the
   * line they wrote.
   */
  const secondLine = subheadline || rotating[0] || '';

  return (
    <section className="neon-hero" data-site-hero>
      <div className="neon-shell">
        <div className="neon-hero__inner">
          <span className="neon-hero__mark" data-drawn={logoKey ? undefined : 'true'}>
            {logoKey ? (
              /*
                Through the optimizer. `mediaUrl()` builds
                `${NEXT_PUBLIC_MEDIA_ORIGIN}/media/<key>`, which `next.config.ts`
                lists under `remotePatterns` with `pathname: '/media/**'`, and
                `/_next/image` re-serves from our own origin so the enforced
                `img-src` in `proxy.ts` is already satisfied.

                Fixed 96×96 with `object-fit: contain` in the stylesheet: the
                intrinsic ratio of an uploaded logo is unknowable here, and the
                box has to be reserved before the bytes land or the headline
                jumps. An admin who uploads a 2000px PNG costs the reader a
                96px request instead of the whole file.

                `alt=""` and the name stated in text beside it — a logo whose
                alt text is the platform name, next to the platform name, is
                the same words twice.
              */
              <Image src={mediaUrl(logoKey)} alt="" width={96} height={96} sizes="96px" priority />
            ) : (
              <span aria-hidden="true">&lt;/&gt;</span>
            )}
          </span>

          {/*
            The terminal line. `$` and the caret are ornament; the words
            between them are the block's own `eyebrowAr`, so this is real
            content in a prompt's clothing rather than a decorative string
            pretending to be a shell.
          */}
          <p className="neon-hero__prompt">
            <Mono className="neon-hero__sigil" hidden>
              $
            </Mono>
            <span className="neon-hero__prompt-text">{eyebrow || neonCopy.heroPromptFallback}</span>
            <Mono className="neon-hero__caret" hidden>
              _
            </Mono>
          </p>

          <Heading className="neon-hero__title">{headline}</Heading>
          {secondLine ? <p className="neon-hero__second">{secondLine}</p> : null}
          {lead ? <p className="neon-hero__lead">{lead}</p> : null}

          {ctaLabel || secondaryCtaLabel ? (
            <div className="neon-hero__cmds">
              {ctaLabel ? (
                <NeonCommand href={ctaHref} variant="run">
                  {ctaLabel}
                </NeonCommand>
              ) : null}
              {secondaryCtaLabel ? (
                <NeonCommand href={secondaryCtaHref} variant="path">
                  {secondaryCtaLabel}
                </NeonCommand>
              ) : null}
            </div>
          ) : null}

          {/*
            The figures. Empty on the shipped default and on the neutral
            fallback both — `DEFAULT_HOME_BLOCKS` documents why — so this
            renders nothing far more often than it renders something, and the
            opener is composed to look finished without it rather than to have
            a hole where it would go.
          */}
          {stats.length > 0 ? (
            <ul className="neon-hero__stats">
              {stats.map((stat) => (
                <li key={stat.labelAr}>
                  {/* The figure is Latin digits inside an RTL line. Isolated,
                      or «1200+» renders as «+1200». */}
                  <Mono className="neon-hero__stat-value">{stat.value}</Mono>
                  <span className="neon-hero__stat-label">{stat.labelAr}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* The wordmark, last and quiet. It is the one place the tenant's
              name is stated in text on this section, which is what lets the
              mark above carry `alt=""`. */}
          <p className="neon-hero__who">{name}</p>
        </div>
      </div>
    </section>
  );
}
