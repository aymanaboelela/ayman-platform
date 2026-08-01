/**
 * The `stats` block's landing section — a row of up to four figures.
 *
 * A Server Component with no motion: the hero already carries an animated stat
 * strip, and a second one that also counts up turns the page into two competing
 * scoreboards. This one is deliberately still.
 */
export function SiteStats({
  title,
  items,
}: {
  title?: string;
  items: readonly { value: string; labelAr: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="site-section">
      <div className="site-shell">
        {title ? (
          <h2 className="site-h2" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            {title}
          </h2>
        ) : null}

        <dl className="statband">
          {items.map((item, index) => (
            <div className="statband__cell" key={`${item.labelAr}-${index}`}>
              {/* `.tabular` so a row of four figures keeps its columns aligned
                  whatever digits land in them. */}
              <dt className="statband__n tabular">{item.value}</dt>
              <dd className="statband__l">{item.labelAr}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
