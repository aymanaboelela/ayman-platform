import Link from 'next/link';
import { copy } from '@ayman/contracts/copy';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { Mono, NeonHead } from './neon-chrome';
import { META, MARKERS, neonCopy } from './neon-copy';

/** The three secondary years the platform's taxonomy describes. */
const YEARS = [1, 2, 3] as const;

const YEAR_LABELS: Record<(typeof YEARS)[number], string> = {
  1: copy.years.year1,
  2: copy.years.year2,
  3: copy.years.year3,
};

/**
 * The `yearTracks` block — `// tracks`. A routing table, not a showpiece.
 *
 * ## Why this is not `<YearTracks>`
 *
 * The classic section is a GSAP scroll sequence: three staged cards, a lit
 * floor, a dragon that flies in and ignites, `'use client'`, ScrollTrigger,
 * a WebGL-adjacent motion timeline and about 900 lines holding it together.
 * None of it can appear on this preset — the dragon is personally Ayman's, and
 * the rest is a visual language this page does not speak.
 *
 * What the section MEANS survives, though, and it is one sentence: "here are
 * the years, pick yours". On a terminal that is a table of routes, so that is
 * what this renders — one row per year, the Arabic label, and the number of
 * published courses behind it in a monospace column.
 *
 * ## The rows are derived, not authored
 *
 * `<YearTracks>` hardcodes three cards, including one for `/essentials`, with
 * hand-written copy per card. That is right for a page whose author knows what
 * is behind each link. This block is placement-only — the admin says WHERE the
 * section goes and nothing else — so the rows come from the catalogue instead,
 * and a year with nothing published does not get a row. A route promising
 * «الصف الثالث» that opens onto «لسه مفيش كورسات منشورة للصف ده» is a worse
 * answer than no row at all, and it is the answer a brand-new stack would give
 * for all three.
 *
 * `/essentials` gets no row for the same reason and one more: whether a tenant
 * has a foundation course at all is not knowable from the year counts, and a
 * link to an empty page is exactly what the paragraph above rules out.
 *
 * ## The whole section stands down on an empty catalogue
 *
 * Not a second empty state. The `courseGrid` section already draws one, and
 * two «لسه فاضي» panels stacked on the same screen read as a broken site
 * rather than as a new one. Reads through `getCatalogOrEmpty`, which is the
 * same `'use cache'` entry `<NeonCourses>` reads — so this section costs the
 * page no extra request, on a cold cache or a warm one.
 */
export async function NeonTracks({ level }: { level: 1 | 2 }) {
  const { courses } = await getCatalogOrEmpty();

  const rows = YEARS.map((year) => ({
    year,
    label: YEAR_LABELS[year],
    count: courses.filter((course) => course.year === year).length,
  })).filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  return (
    <section className="neon-section" id="years">
      <div className="neon-shell">
        <NeonHead
          marker={MARKERS.tracks}
          title={neonCopy.tracksTitle}
          lead={neonCopy.tracksLead}
          level={level}
        />

        <ul className="neon-routes">
          {rows.map((row) => (
            <li key={row.year}>
              {/*
                The whole row is the link. A route table whose only target is
                a small chevron at the end is a row you have to aim at; this
                one is a 44px-tall target across the full width of the shell,
                which is what a thumb on a 390px screen actually gets.
              */}
              <Link className="neon-route" href={`/years/${row.year}`}>
                <Mono className="neon-route__index" hidden>
                  {String(row.year).padStart(2, '0')}
                </Mono>
                <span className="neon-route__label">{row.label}</span>
                <span className="neon-route__leader" aria-hidden="true" />
                <span className="neon-route__count">
                  <Mono>{`${row.count} ${META.courses}`}</Mono>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
