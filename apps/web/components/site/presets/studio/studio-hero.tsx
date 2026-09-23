import Image from 'next/image';
import Link from 'next/link';

import { mediaUrl } from '@ayman/ui/branding';

import { studioCopy } from './studio-copy';

export interface StudioHeroProps {
  eyebrow: string;
  headline: string;
  subheadline: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  stats: readonly { labelAr: string; value: string }[];
  /** The instructor's photograph, resolved to a storage key by the API. */
  portraitKey: string | null;
  level: 1 | 2;
}

/**
 * The opener — and the whole argument for this preset.
 *
 * ## The photograph is the design
 *
 * A student choosing where to learn programming is choosing a PERSON, not a
 * syllabus: they have three tabs open and all three promise the same
 * curriculum, because it is the same ministry curriculum. What differs is who
 * is going to explain it. So the instructor's own photograph is the largest
 * object on the page, bled off the bottom of the opener at full column height,
 * and everything else is arranged around it.
 *
 * This is the opposite of what «الترمينال» does with the same slot, where the
 * only image is a 96px logo in a square and the face never appears at all.
 *
 * ## Why there is real code next to it
 *
 * The headline on the shipped page promises programming is easier than the
 * reader thinks. A page that only ASSERTS that is a page making a claim; a
 * page that puts three lines of runnable code where the reader can count the
 * characters — a variable, a call, and the line it prints — has shown them.
 * The comment is Arabic because the reader is, and because the single most
 * common thing a beginner does not know is that the machine ignores it.
 *
 * ⚠️ `studioCopy.heroCode` is REAL Python. Not plausible-looking filler: a
 * reader who knows any is the exact reader who spots invented syntax, and this
 * panel's entire job is to be trusted at a glance.
 *
 * ## No photograph is a supported state, not a broken one
 *
 * A tenant who has picked this preset and not yet uploaded a portrait gets the
 * copy column at full width with the code panel beside it. That is a page that
 * still works rather than a reserved empty rectangle — and it is what every
 * stack sees on the first render after switching preset, before anyone has
 * been to /admin/settings.
 */
export function StudioHero({
  eyebrow,
  headline,
  subheadline,
  lead,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  stats,
  portraitKey,
  level,
}: StudioHeroProps) {
  const Title = level === 1 ? 'h1' : 'h2';

  return (
    <section className="st-hero" data-site-hero data-has-portrait={portraitKey ? 'true' : undefined}>
      <div className="st-shell st-hero__grid">
        <div className="st-hero__copy">
          {eyebrow ? <p className="st-chip">{eyebrow}</p> : null}

          <Title className="st-hero__title">{headline}</Title>
          {subheadline ? <p className="st-hero__second">{subheadline}</p> : null}
          <p className="st-hero__lead">{lead || studioCopy.heroLeadFallback}</p>

          {ctaLabel || secondaryCtaLabel ? (
            <div className="st-hero__acts">
              {ctaLabel ? (
                <Link className="st-btn st-btn--solid" href={ctaHref}>
                  {ctaLabel}
                </Link>
              ) : null}
              {secondaryCtaLabel ? (
                <Link className="st-btn st-btn--quiet" href={secondaryCtaHref}>
                  {secondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          ) : null}

          {/*
            Empty on the shipped defaults and on the neutral fallback both, so
            a new stack shows no figures rather than three zeroes. `value`
            first and `labelAr` under it: the number is what the eye lands on.
          */}
          {stats.length > 0 ? (
            <dl className="st-hero__stats">
              {stats.map((stat) => (
                <div className="st-stat" key={`${stat.labelAr}-${stat.value}`}>
                  <dt className="st-stat__n tabular-nums">{stat.value}</dt>
                  <dd className="st-stat__l">{stat.labelAr}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="st-hero__stage">
          {portraitKey ? (
            /*
              `priority`: this is the largest thing in the viewport on first
              paint, so it IS the LCP element — leaving it lazy would cost the
              page its own headline metric.

              3:4 at 1200×1600 matches `BRAND_ASSET_RATIO.portrait` and the
              crop the admin's picker offers, so the box and the file agree and
              `cover` has nothing to trim on a correctly cropped upload.

              `alt=""`: the heading and the section below both name the person.
              A third reading of the same name is noise, and there is no
              information in the photograph a reader who cannot see it needs.
            */
            <Image
              className="st-hero__portrait"
              src={mediaUrl(portraitKey)}
              alt=""
              width={1200}
              height={1600}
              sizes="(max-width: 60rem) 80vw, 34rem"
              priority
            />
          ) : null}

          <figure className="st-code">
            <figcaption className="st-code__cap">{studioCopy.heroCodeLabel}</figcaption>
            {/*
              A `<pre>` so the whitespace is the code's own, and one `<code>`
              per line so the comment can take the muted colour without a
              syntax highlighter shipping to the browser for three lines.

              `dir="ltr"` is load-bearing and not a nicety: this is a page in
              Arabic, so the inherited direction is RTL, and RTL applied to
              `print("أهلاً يا", name)` reorders the brackets and the quotes
              around the Arabic string into something that is no longer the
              code anybody typed.
            */}
            <pre className="st-code__body" dir="ltr">
              {studioCopy.heroCode.map((line) => (
                <code className="st-code__line" key={line.comment ?? line.code ?? ''}>
                  {line.comment ? (
                    <span className="st-code__comment" dir="rtl">
                      {line.comment}
                    </span>
                  ) : (
                    line.code
                  )}
                </code>
              ))}
            </pre>
            <p className="st-code__out">
              <span className="st-code__out-l">&gt;</span> {studioCopy.heroCodeOut}
            </p>
          </figure>
        </div>
      </div>
    </section>
  );
}
