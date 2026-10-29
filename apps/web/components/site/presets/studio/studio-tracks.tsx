import Link from 'next/link';

import { getCatalogOrEmpty } from '@/lib/catalog';
import { yearPages } from '@/lib/grade-pages';

import { StudioHeading } from './studio-heading';
import { studioCopy } from './studio-copy';

/**
 * The `yearTracks` block — one panel per year of the system.
 *
 * ## It draws the years even when the catalogue is empty
 *
 * The years exist whether or not a course has been published into them: a
 * student arriving in August is choosing their year, and a section that
 * vanishes because the shop is not stocked yet tells them the site is broken
 * rather than early. The count is simply omitted when it is zero — «٠ كورس» is
 * a fact nobody needs stated.
 *
 * This is the opposite answer to «الترمينال»'s, where `<NeonTracks>` returns
 * `null` on an empty catalogue so a new stack does not show two empty panels
 * in a row. Both are defensible; what matters is that each preset's
 * `ownsPageHeading` agrees with the component it is describing, because that
 * predicate is what keeps an `<h1>` on the page.
 */
export async function StudioTracks({ level }: { level: 1 | 2 }) {
  const { courses } = await getCatalogOrEmpty();

  // `yearPages()` is the three years on every stack but one with
  // `TENANT_GRADES`, where it is the stack's grades (`lib/grade-pages.ts`).
  const YEARS = yearPages().map((page) => ({
    key: page.segment,
    year: page.n,
    label: page.title,
    stage: page.stageAr,
    count: courses.filter(page.matches).length,
  }));

  return (
    <section className="st-section" id="years">
      <div className="st-shell">
        <StudioHeading
          chip={studioCopy.chipYears}
          title={studioCopy.yearsTitle}
          lead={studioCopy.yearsLead}
          level={level}
        />

        <ul className="st-years" role="list">
          {YEARS.map((entry) => {
            const count = entry.count;

            return (
              <li className="st-year" key={entry.key}>
                <Link className="st-year__link" href={`/years/${entry.key}`}>
                  <span className="st-year__n tabular-nums" aria-hidden="true">
                    {entry.year}
                  </span>
                  <span className="st-year__body">
                    {entry.stage ? <span className="st-year__stage">{entry.stage}</span> : null}
                    <span className="st-year__t">{entry.label}</span>
                    {count > 0 ? (
                      <span className="st-year__c">{studioCopy.yearsCount(count)}</span>
                    ) : null}
                  </span>
                  {/* ← is «forward» in RTL; arrows are not mirrored by bidi, so the glyph is already the right way round. */}
                  <span className="st-year__go" aria-hidden="true">
                    ←
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
