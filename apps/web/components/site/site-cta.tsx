import Link from 'next/link';

/**
 * The `cta` block's landing section — a closing panel with one button.
 *
 * Dark in both themes, like the hero: it is the page's last frame and the only
 * other place the eye is meant to stop. Everything between them is a light
 * surface in light mode, so two lit stages bracket the page instead of one
 * hanging at the top.
 */
export function SiteCta({
  headline,
  lead,
  ctaLabel,
  ctaHref,
}: {
  headline: string;
  lead?: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section className="site-section closer">
      <div className="site-shell">
        <div className="closer__panel">
          <h2 className="closer__title">{headline}</h2>
          {lead ? <p className="closer__lead">{lead}</p> : null}
          <Link className="site-btn site-btn--light" href={ctaHref}>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
