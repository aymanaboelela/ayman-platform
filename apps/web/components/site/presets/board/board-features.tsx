import { Compass, MonitorPlay, NotebookPen, Repeat, Route, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * Icons are POSITIONAL, and that is not a shortcut — it is the same rule
 * `why-rail.tsx` states and for the same two reasons. The composer has no icon
 * picker: an editor choosing from 1,400 lucide glyphs produces an incoherent
 * grid, and storing a glyph NAME in a `home_blocks` row couples a database row
 * to an icon package's export list, so a rename upstream renders a published
 * block with a hole in it. The Nth card takes the Nth glyph and the list wraps
 * when a rail runs longer than this set.
 *
 * The SET is deliberately not `why-rail.tsx`'s. That one is Ayman's — a flag, a
 * `Code2`, a dumbbell, a line chart — chosen for a programming course sold to
 * people who already know they want one. These are drawn from teaching in
 * general: a direction, a lesson, notes, repetition, a target. A tenant who
 * rewrote all eight cards should not find a barbell on card three.
 */
const GLYPHS = [
  <Compass key="compass" size={22} strokeWidth={2} />,
  <MonitorPlay key="play" size={22} strokeWidth={2} />,
  <NotebookPen key="notes" size={22} strokeWidth={2} />,
  <Repeat key="repeat" size={22} strokeWidth={2} />,
  <Target key="target" size={22} strokeWidth={2} />,
  <Route key="route" size={22} strokeWidth={2} />,
  <ShieldCheck key="shield" size={22} strokeWidth={2} />,
  <Sparkles key="spark" size={22} strokeWidth={2} />,
];

/**
 * «ليه تختار منصتنا؟» — the `whyRail` block as a plain grid of cards, each
 * with a filled circular badge on its leading edge.
 *
 * ## Why it is a grid and not the rail
 *
 * `<WhyRail>` pins the section to the viewport and scrubs the cards sideways
 * on scroll. That is a showpiece, it is `'use client'`, it carries a GSAP
 * ScrollTrigger and a `matchMedia` teardown, and it hijacks the scroll gesture
 * for the length of the rail. None of it belongs here: «اللوح» is a poster —
 * solid blocks, centred, everything visible at once — and a section that takes
 * the page hostage while eight cards slide past is the opposite of that. A
 * grid also shows all eight at a glance on a desktop, which is what a reader
 * deciding whether to sign up is actually doing.
 *
 * The consequence is that this whole page needs no client JavaScript, which is
 * the other half of the trade — see `board-landing.tsx`.
 *
 * ## `titleAccentAr`
 *
 * Rendered inline after the title, in the accent, exactly as `classic` does.
 * On a heading that is already large and centred it reads as the emphasised
 * half of one sentence rather than as a second heading.
 */
export function BoardFeatures({
  title,
  titleAccent,
  lead,
  leadSecondary,
  items,
  level,
}: {
  title: string;
  titleAccent: string;
  lead: string;
  leadSecondary: string;
  items: readonly { titleAr: string; bodyAr: string }[];
  level: 1 | 2;
}) {
  return (
    <section className="board-band">
      <div className="board-shell">
        {/* Both lead paragraphs go INTO the header — see `leadSecondary` on
            `<BoardHeading>` for why the second one is not a sibling. */}
        <BoardHeading
          chip={boardCopy.features.chip}
          title={titleAccent ? `${title} ${titleAccent}` : title}
          lead={lead}
          leadSecondary={leadSecondary}
          level={level}
        />

        {/* `role="list"` is on the `<ul>` because `list-style: none` drops list
            semantics in Safari/VoiceOver, and "8 items" is the one thing a
            screen-reader user gains from this section being a list at all —
            the same handling `about-instructor.tsx` documents. */}
        <ul className="board-features" role="list">
          {items.map((item, index) => (
            <li className="board-feature" key={`${item.titleAr}-${index}`}>
              <span className="board-feature__badge" aria-hidden="true">
                {GLYPHS[index % GLYPHS.length]}
              </span>
              <h3 className="board-feature__title">{item.titleAr}</h3>
              <p className="board-feature__body">{item.bodyAr}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
