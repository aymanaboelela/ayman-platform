import { BoardHeading } from './board-heading';

/**
 * The `stats` block — up to four figures, as one solid band.
 *
 * ## No counting animation, on this preset or on `classic`
 *
 * `<SiteStats>` is deliberately still, and its reason applies here with one
 * more term: this page has no client boundary at all (see
 * `board-landing.tsx`), so an odometer would be the single thing that dragged
 * a JavaScript bundle onto a page that otherwise ships none — to animate four
 * numbers a reader can already read.
 *
 * ## The title is optional and the section still stands
 *
 * `titleAr` on this block defaults to `''`, and an admin who leaves it blank
 * means "just the figures". The heading is skipped rather than rendered empty,
 * which is also why `board-landing.tsx` does not let a title-less `stats`
 * block own the page's `<h1>` — there would be nothing for it to be.
 *
 * `items` is `.min(1)` in the contract, so an empty band is not a state this
 * can be in; there is no "no figures" branch because there is no such block.
 */
export function BoardStats({
  title,
  items,
  level,
}: {
  title: string;
  items: readonly { labelAr: string; value: string }[];
  level: 1 | 2;
}) {
  return (
    <section className="board-band board-band--slab">
      <div className="board-shell">
        {title ? <BoardHeading title={title} level={level} /> : null}

        <dl className="board-figures">
          {items.map((item, index) => (
            <div className="board-figure" key={`${item.labelAr}-${index}`}>
              {/* `.tabular-nums` so four figures in a row keep their columns
                  aligned whatever digits land in them — a «1,240» beside a
                  «98%» otherwise sits a few pixels off its neighbours. */}
              <dt className="board-figure__n tabular-nums">{item.value}</dt>
              <dd className="board-figure__l">{item.labelAr}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
