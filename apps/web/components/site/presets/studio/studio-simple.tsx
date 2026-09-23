import Link from 'next/link';

import { copy } from '@ayman/contracts/copy';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';

import { StudioHeading } from './studio-heading';
import { studioCopy } from './studio-copy';

/**
 * The four block types that are lists of short records, sharing one shape.
 *
 * `stats`, `testimonials`, `honorBoard` and `books` all render «a heading and
 * then some rows», and giving each its own bespoke layout on this preset would
 * be four designs to keep in step for content most instructors never fill in.
 * They share `.st-rows`; what differs is what a row contains.
 *
 * ⚠️ Each one still STANDS DOWN on empty rather than drawing a heading over
 * nothing — which is also why `ownsPageHeading` in `studio-landing.tsx`
 * refuses to trust any of them with the page's `<h1>`.
 */

export function StudioStats({
  title,
  items,
  level,
}: {
  title: string;
  items: readonly { labelAr: string; value: string }[];
  level: 1 | 2;
}) {
  if (items.length === 0) return null;

  return (
    <section className="st-section" id="numbers">
      <div className="st-shell">
        {title ? <StudioHeading title={title} level={level} /> : null}
        <dl className="st-figures">
          {items.map((item) => (
            <div className="st-figure" key={`${item.labelAr}-${item.value}`}>
              <dt className="st-figure__n tabular-nums">{item.value}</dt>
              <dd className="st-figure__l">{item.labelAr}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function StudioQuotes({
  title,
  items,
  level,
}: {
  title: string;
  items: readonly { nameAr: string; bodyAr: string }[];
  level: 1 | 2;
}) {
  if (items.length === 0) return null;

  return (
    <section className="st-section" id="quotes">
      <div className="st-shell">
        <StudioHeading chip={studioCopy.chipQuotes} title={title} level={level} />
        <ul className="st-rows" role="list">
          {items.map((item) => (
            <li className="st-quote" key={item.nameAr}>
              {/* The quotation marks are in the stylesheet, not the markup: a
                  literal « in the text would be read aloud by a screen reader
                  and would survive a copy-paste of the sentence. */}
              <blockquote className="st-quote__b">{item.bodyAr}</blockquote>
              <p className="st-quote__n">{item.nameAr}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function StudioHonors({
  entries,
  level,
}: {
  entries: readonly HonorBoardEntry[];
  level: 1 | 2;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="st-section" id="honors">
      <div className="st-shell">
        <StudioHeading
          chip={studioCopy.chipHonors}
          title={copy.landing.honorBoard.title}
          level={level}
        />
        <ol className="st-rows st-honors">
          {entries.map((entry) => (
            <li
              className="st-honor"
              key={`${entry.studentName}-${entry.courseLabel}-${entry.rank}`}
            >
              {/* The written rank, not the row's index: the board can carry a
                  first and a second from two different courses, and numbering
                  by position renames the second «الأول» a second time. */}
              <span className="st-honor__r">{copy.landing.honorBoard.placeRanks[entry.rank - 1] ?? ''}</span>
              <span className="st-honor__n">{entry.studentName}</span>
              <span className="st-honor__note">{entry.courseLabel}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function StudioBooksLink({
  title,
  lead,
  ctaLabel,
  level,
}: {
  title: string;
  lead: string;
  ctaLabel: string;
  level: 1 | 2;
}) {
  return (
    <section className="st-section" id="books">
      <div className="st-shell st-shell--narrow">
        <StudioHeading chip={studioCopy.chipBooks} title={title} lead={lead} level={level} />
        {ctaLabel ? (
          <div className="st-section__foot">
            <Link className="st-btn st-btn--quiet" href="/books">
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
