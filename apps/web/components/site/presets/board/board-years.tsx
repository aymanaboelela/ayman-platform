import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { courseCountLabel } from '@/lib/course-groups';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * The year names come from the ONE place they are written. A second spelling
 * of «الصف الأول بكالوريا» in this file is how the landing page and
 * `/years/1` — the page these tiles link to — end up calling the same year two
 * different things.
 */
const YEAR_NAMES: Record<number, string> = {
  1: copy.years.year1,
  2: copy.years.year2,
  3: copy.years.year3,
};

/**
 * The years an empty catalogue shows.
 *
 * Secondary here is a three-year system and `/years/3` is a real route, but a
 * brand-new instructor is almost never teaching all three on day one and a
 * tile for a year with nothing behind it is a door onto «لسه مفيش كورسات
 * منشورة للصف ده». Two is also what the tiles are DESIGNED around — they are
 * the loudest object on the page and they earn that by being few.
 *
 * This is only ever the fallback: the moment a single course is published the
 * list below is derived from the catalogue instead, so an instructor who does
 * teach third year gets a third tile without anybody editing this file.
 */
const FALLBACK_YEARS = [1, 2] as const;

/**
 * «ابدأ من صفّك» — the year tiles, and the first real choice this page asks a
 * visitor to make.
 *
 * ## Real data, from the catalogue this platform already caches
 *
 * The years shown are the years that actually have published courses, read
 * through `getCatalogOrEmpty()` — the same loader `<FeaturedCourses>` and
 * `<InstructorProfile>` use, so the landing page issues one cached catalogue
 * fetch no matter how many sections want it. A tile therefore never promises a
 * year the instructor does not teach.
 *
 * `getCatalogOrEmpty` and not `getCatalog`: an unreachable API costs this
 * section its course COUNTS and falls back to the two standard years, rather
 * than costing the landing page. That trade is the reason the `OrEmpty`
 * variant exists — see its own note.
 *
 * ## Why it is not `<YearTracks>`
 *
 * That component is the `yearTracks` block on `classic`, and it is 48 KB of
 * Ayman's identity: three editor-window cards carrying hand-written JavaScript,
 * a cut-out photograph of him standing behind them, a dragon that ignites on a
 * scroll-scrubbed video clip, sixteen drifting code glyphs, and two hard-coded
 * orange hex values that are «AYMAN's two oranges and nothing derived
 * reproduces them». None of it can appear on another instructor's site, and
 * none of it would survive being recoloured — what is left after removing the
 * photograph, the dragon and the code is a different component, which is this
 * one.
 *
 * ## The tile is deliberately the loudest thing here
 *
 * A filled block of the brand colour, a numeral set enormous, the year's name
 * under it. A visitor who reads nothing else on this page can still answer the
 * only question that matters on a first visit — «فين كورسات سنتي؟» — from
 * across the room.
 *
 * ## `yearTracks` carries no props, and that is the contract
 *
 * `{ type: 'yearTracks' }` and nothing else: the section builds itself from the
 * taxonomy, so an admin decides only whether it runs and where it sits. This
 * component keeps that promise — every word on it comes from the shared copy
 * table or from the catalogue, none of it from the stored row.
 */
export async function BoardYears({ level }: { level: 1 | 2 }) {
  const { courses } = await getCatalogOrEmpty();

  /*
   * `Map` rather than two passes: one walk of the catalogue produces both the
   * set of years that exist and the count per year, and the count is what
   * turns a tile from a navigation label into a statement about what is
   * behind it.
   */
  const counts = new Map<number, number>();
  for (const course of courses) counts.set(course.year, (counts.get(course.year) ?? 0) + 1);

  const years =
    counts.size > 0 ? [...counts.keys()].sort((a, b) => a - b) : [...FALLBACK_YEARS];

  return (
    <section className="board-band" id="years">
      <div className="board-shell">
        <BoardHeading
          chip={boardCopy.years.chip}
          title={boardCopy.years.title}
          lead={boardCopy.years.lead}
          level={level}
        />

        <ul className="board-years" role="list">
          {years.map((year) => {
            const count = counts.get(year) ?? 0;

            return (
              <li className="board-tile" key={year}>
                {/*
                  ONE anchor around the entire tile, with a button-SHAPED span
                  inside it rather than a nested `<a>`. A link inside a link is
                  invalid HTML and the browser closes the outer one at the inner
                  tag, which leaves the numeral and the year name pointing
                  nowhere — the exact bug `books-strip.tsx` documents having
                  hit. The tile is one destination, so it is one link.
                */}
                <Link className="board-tile__link" href={`/years/${year}`}>
                  <span className="board-tile__eyebrow">{boardCopy.years.tileEyebrow}</span>

                  {/*
                    ⚠️ `direction: ltr; unicode-bidi: isolate` in the stylesheet,
                    not optional.

                    The document is `dir="rtl"`, and a Western digit is
                    bidi-neutral-adjacent: on its own it is fine, but sitting
                    between Arabic runs it joins whichever direction wins the
                    resolution and a two-digit year would reorder. Isolating it
                    means the numeral is its own bidi run whatever ends up
                    around it. Western digits rather than Arabic-Indic because
                    that is what every other number on this platform uses —
                    `formatEGP` pins `-u-nu-latn` deliberately, and a page that
                    prints «٢» here and «250» on a price card is printing two
                    number systems one scroll apart.
                  */}
                  <span className="board-tile__n" aria-hidden="true">
                    {year}
                  </span>

                  {/* The accessible name of the tile. The numeral above is
                      `aria-hidden` precisely so this is not announced as
                      «2 الصف الثاني بكالوريا». */}
                  <span className="board-tile__name">{YEAR_NAMES[year] ?? ''}</span>

                  {/* Only when there is something to count. «0 كورس» under a
                      year tile is a worse answer than no line at all, and on a
                      fresh install every tile would carry one. */}
                  {count > 0 ? (
                    <span className="board-tile__count">{courseCountLabel(count)}</span>
                  ) : null}

                  <span className="board-tile__go">{boardCopy.years.tileCta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
