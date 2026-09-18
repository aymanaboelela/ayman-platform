import Link from 'next/link';

/**
 * The `cta` block — the page's closing panel.
 *
 * ## It is the SAME solid block the page opened with
 *
 * `<SiteCta>` makes the argument for `classic`: the hero and the closer are the
 * only two places the eye is meant to stop, so two lit stages bracket the page
 * instead of one hanging at the top. Same structure here, with this preset's
 * own material — the deep accent fill, the curved edge, everything centred.
 * The curve is on the TOP corners rather than the bottom, so the two panels
 * read as one shape closing: the page opens with a block curving away from the
 * reader and ends with one curving back.
 *
 * `.site-btn--light` is the white pill, which is the only button that works on
 * this fill: `--solid` would be the accent on the accent, and `--outline`
 * reads the ambient foreground, which is near-black under the light theme.
 *
 * `ctaLabelAr` and `ctaHref` are both `.min()`-constrained in the contract —
 * a `cta` block cannot exist without a button — so there is no branch here for
 * a panel with nothing to press.
 *
 * This block never owns the page's `<h1>`: it is the closer, and a page whose
 * only heading is its last line is a page a screen reader cannot navigate. See
 * `ownsPageHeading` in `board-landing.tsx`, which is where that is enforced.
 */
export function BoardCta({
  headline,
  lead,
  ctaLabel,
  ctaHref,
}: {
  headline: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section className="board-closer">
      <div className="board-shell">
        <h2 className="board-closer__title">{headline}</h2>
        {lead ? <p className="board-closer__lead">{lead}</p> : null}
        <Link className="site-btn site-btn--light" href={ctaHref}>
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
