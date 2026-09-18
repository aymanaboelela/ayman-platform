import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * The `testimonials` block — what students said, as cards.
 *
 * ## `<blockquote>` + `<figcaption>`, not two paragraphs
 *
 * A testimonial is an attributed quotation and the pairing is the only thing
 * that tells a screen reader who said it. Two `<p>`s render identically and
 * announce as two unrelated sentences. Same markup `<SiteTestimonials>` uses,
 * and for the same reason.
 *
 * ## `avatarAssetId` is stored and is still not read
 *
 * The composer lets an editor attach an avatar to a quote, and nothing on this
 * platform renders it — `<SiteTestimonials>` does not either. The reason is the
 * one `BrandingReadSchema` documents at length: the block carries the asset's
 * UUID and a URL needs the row's `storage_key`, and deriving one from the other
 * is what made every admin-chosen favicon 404 silently for months. The API
 * resolves keys for the branding payload and does not for home blocks.
 *
 * So the initial disc stands in — the same answer `<SiteTestimonials>` gives,
 * and a real designed one rather than a broken image box. This preset is not
 * the place to be the first surface where a half-built field appears to work;
 * when the contract grows a resolved key, both components gain the picture in
 * one change.
 *
 * `items` is `.min(1)` in the contract, so there is no empty state to design.
 */
export function BoardQuotes({
  title,
  items,
  level,
}: {
  title: string;
  items: readonly { nameAr: string; bodyAr: string }[];
  level: 1 | 2;
}) {
  return (
    <section className="board-band">
      <div className="board-shell">
        {title ? (
          <BoardHeading chip={boardCopy.quotes.chip} title={title} level={level} />
        ) : null}

        <ul className="board-quotes" role="list">
          {items.map((item, index) => (
            <li key={`${item.nameAr}-${index}`}>
              <figure className="board-quote">
                {/* A drawn quotation mark, `aria-hidden` because the
                    `<blockquote>` underneath already carries the semantics —
                    a screen reader announcing a stray «”» says nothing. */}
                <span className="board-quote__mark" aria-hidden="true">
                  &rdquo;
                </span>
                <blockquote className="board-quote__body">{item.bodyAr}</blockquote>
                <figcaption className="board-quote__who">
                  <span className="board-quote__avatar" aria-hidden="true">
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
