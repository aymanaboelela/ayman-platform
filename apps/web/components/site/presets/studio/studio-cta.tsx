import Link from 'next/link';

/**
 * The `cta` block — the only dark band on the whole page.
 *
 * ## Why exactly one
 *
 * This preset's ground is light from the header to the footer, so a dark field
 * is the strongest contrast move available and it can only be spent once. It
 * is spent here, on the single moment the page exists for: creating an
 * account. A second dark section anywhere above this one would cost this one
 * its meaning — the reader would have already seen the page do that.
 *
 * The button inside it is the light pill rather than the accent-filled one:
 * the band is already deep brand colour, so a filled accent button would be
 * the accent sitting on the accent with nothing separating them.
 */
export function StudioCta({
  headline,
  lead,
  ctaLabel,
  ctaHref,
  level,
}: {
  headline: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
  level: 1 | 2;
}) {
  const Title = level === 1 ? 'h1' : 'h2';

  return (
    <section className="st-close" id="start">
      <div className="st-shell st-close__inner">
        <Title className="st-close__t">{headline}</Title>
        {lead ? <p className="st-close__l">{lead}</p> : null}
        {ctaLabel ? (
          <Link className="st-btn st-btn--light" href={ctaHref}>
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
