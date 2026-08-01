/**
 * The `testimonials` block's landing section.
 *
 * Quotes render inside `<blockquote>` + `<figcaption>` rather than two
 * `<p>`s — a testimonial is an attributed quotation, and the pairing is what
 * tells a screen reader who said it. No star ratings and no avatars-by-default:
 * the composer stores an optional `avatarAssetId` and nothing reads it yet, so
 * an initial disc stands in rather than a broken image box.
 */
export function SiteTestimonials({
  title,
  items,
}: {
  title?: string;
  items: readonly { nameAr: string; bodyAr: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="site-section site-section--tint">
      <div className="site-shell">
        {title ? (
          <h2 className="site-h2" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            {title}
          </h2>
        ) : null}

        <ul className="quotes">
          {items.map((item, index) => (
            <li key={`${item.nameAr}-${index}`}>
              <figure className="quotes__card site-card">
                <span className="quotes__mark" aria-hidden="true">
                  &rdquo;
                </span>
                <blockquote className="quotes__body">{item.bodyAr}</blockquote>
                <figcaption className="quotes__who">
                  <span className="quotes__avatar" aria-hidden="true">
                    {item.nameAr.trim().charAt(0)}
                  </span>
                  {item.nameAr}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
