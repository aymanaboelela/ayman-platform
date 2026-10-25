'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fillSubject, subjectCopy } from '@ayman/contracts/copy/subject';
import { ElectricCard } from '@/components/site/electric-card';
import { useRampHex } from '@/lib/ramp-color';
import { ASKS_GRADE, STAGE_WORDS, TENANT_GRADES } from '@/lib/tenant-grades';

const s = subjectCopy.landing;

/**
 * The cards: the three secondary years, or — on a stack with `TENANT_GRADES`
 * — one per grade, linking to that grade's page (`lib/grade-pages.ts`).
 */
const CARDS: readonly { key: string; href: string; title: string; body: string }[] = ASKS_GRADE
  ? TENANT_GRADES.map((grade) => ({
      key: grade.slug,
      href: `/years/${grade.slug}`,
      title: grade.labelAr,
      body: fillSubject(s.gradeBody, { grade: grade.labelAr }),
    }))
  : s.trackYearTitles.map((title, index) => ({
      key: String(index + 1),
      href: `/years/${index + 1}`,
      title,
      body: fillSubject(s.trackYearBody, { year: title }),
    }));

/** `.track`'s `--r-lg`, in pixels — the same number `year-tracks.tsx` keeps. */
const TRACK_RADIUS = 12;

/**
 * The server-rendered border colour before `useRampHex` swaps in this stack's
 * own ramp after hydration — the same value, and the same hand-off, as the
 * flank cards in `year-tracks.tsx`. A canvas has no cascade, so it cannot take
 * a `var()`; see the note on `ACTIVE_BORDER` there.
 */
const BORDER = '#D25C10';

/**
 * «كورسات كل صف» — the `yearTracks` block on a stack that does not teach code.
 *
 * ## Why this is a different component and not a prop on the other one
 *
 * `<YearTracks>` is three editor windows — `essentials/core.js`, «// أول سطر
 * كود ليك», a status bar reading «build passing» — staged over a lit floor in
 * front of a cut-out photograph and a dragon that ignites on a scroll-scrubbed
 * clip. Strip the code, the photograph and the dragon out of it and nothing of
 * that component is left but the section's `<header>`, which is the argument
 * `board-years.tsx` makes for the same decision. The first of its three cards
 * was also «التأسيس», a glossary of programming terms that 404s on a stack like
 * this one.
 *
 * So the block keeps its contract — `{ type: 'yearTracks' }`, placement only,
 * built from nothing the admin typed — and on this kind of stack it is the
 * three years of secondary school, each a plain card in the same `.track`
 * skin, linking to that year's page. No year is the "active" one: a programming
 * stack spotlights the year its content reaches; this one cannot know which
 * year a teacher of another subject is strongest in.
 *
 * A NEW module, not an export added to `track-card.tsx` or `year-tracks.tsx`,
 * because both are client modules a tab may hold from the previous build — see
 * `lib/tenant-subject.ts`.
 */
export function YearCards() {
  const border = useRampHex(600, BORDER);

  return (
    <section
      className="tracks"
      id="years"
      /* No sky band: `.tracks` reserves `min(40vh, 22rem)` above the stage for
         the dragon to fly down through, and there is no dragon here. Inline for
         the reason `year-tracks.tsx` gives for the same override. */
      style={{ paddingTop: 0 }}
    >
      <div className="tracks__wash" aria-hidden="true" />
      <div className="tracks__floor" aria-hidden="true" />

      <div className="tracks__inner">
        <header className="tracks__head">
          <span className="site-badge">{s.tracksBadge}</span>
          <h2 className="site-h2" style={{ marginTop: '1rem' }}>
            {s.tracksTitle}
          </h2>
          <p className="site-lead">{fillSubject(s.tracksLead, { ...STAGE_WORDS })}</p>
        </header>

        <ul className="tracks__grid" role="list">
          {CARDS.map((card, index) => (
            <li key={card.key}>
              <ElectricCard color={border} radius={TRACK_RADIUS} speed={0.5} chaos={0.1}>
                <Link href={card.href} className="track">
                  <div className="track__meta">
                    <p className="track__tag">— {fillSubject(s.trackYearTag, { n: `0${index + 1}` })}</p>
                    <h3 className="track__title">{card.title}</h3>
                    <p className="track__body">{card.body}</p>
                    <span className="track__go">
                      <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
                      {s.trackYearCta}
                    </span>
                  </div>
                </Link>
              </ElectricCard>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
