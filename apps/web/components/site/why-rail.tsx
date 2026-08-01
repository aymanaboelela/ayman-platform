'use client';

import { useRef } from 'react';
import {
  Award,
  BookOpenCheck,
  Code2,
  Dumbbell,
  Flag,
  Layers,
  LineChart,
  Lightbulb,
} from 'lucide-react';
import { copy } from '@ayman/contracts';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';

const c = copy.landing;

export interface WhyRailItem {
  titleAr: string;
  bodyAr: string;
}

/**
 * Icons are positional, not stored.
 *
 * The composer has no icon picker and is not getting one: an editor choosing
 * from 1,400 lucide glyphs produces an inconsistent rail, and storing a glyph
 * NAME in `props` would couple a database row to an icon package's export list
 * — rename or drop an export upstream and a published block renders nothing.
 * The Nth card takes the Nth icon here and wraps if the rail is longer, so
 * reordering or rewriting cards in the admin always yields a coherent set.
 */
const ICONS = [
  <Flag size={26} key="flag" />,
  <Code2 size={26} key="code" />,
  <Dumbbell size={26} key="dumbbell" />,
  <LineChart size={26} key="chart" />,
  <Layers size={26} key="layers" />,
  <BookOpenCheck size={26} key="book" />,
  <Award size={26} key="award" />,
  <Lightbulb size={26} key="bulb" />,
];

/** Reading order, which is also the order they travel past. */
const DEFAULT_ITEMS: WhyRailItem[] = [
  { titleAr: c.why1Title, bodyAr: c.why1Body },
  { titleAr: c.why2Title, bodyAr: c.why2Body },
  { titleAr: c.why3Title, bodyAr: c.why3Body },
  { titleAr: c.why4Title, bodyAr: c.why4Body },
  { titleAr: c.why5Title, bodyAr: c.why5Body },
  { titleAr: c.why6Title, bodyAr: c.why6Body },
  { titleAr: c.why7Title, bodyAr: c.why7Body },
  { titleAr: c.why8Title, bodyAr: c.why8Body },
];

/**
 * "Why learn here" — the section pins to the viewport and its cards travel
 * sideways as you scroll down.
 *
 * ## How the pin works
 *
 * One ScrollTrigger pins the section and scrubs a single `x` tween on the rail.
 * The scroll DISTANCE is the rail's overflow width, not an arbitrary multiple
 * of the viewport: that makes the last card land exactly at the trailing edge
 * as the pin releases, however many cards there are and whatever they measure.
 * Hard-coding `end: '+=2000'` is the usual way this breaks — it either strands
 * empty space or cuts the last card off the moment the copy changes length.
 *
 * ## RTL
 *
 * The rail is laid out right-to-left with the document, so the overflow spills
 * off-screen to the LEFT and "forward" is POSITIVE x — the opposite of the
 * usual LTR case. That sign is applied once, on the tween, rather than being
 * sprinkled through the measurements.
 *
 * ## Below the pin breakpoint
 *
 * Pinning a section on a phone hijacks the one gesture the user has. Under
 * 64rem the rail becomes a normal horizontal scroller they can swipe, with
 * scroll-snap — same markup, no ScrollTrigger, no pin.
 */
export function WhyRail({
  title = c.whyTitle,
  titleAccent = c.whyTitleAccent,
  lead = c.whyLead,
  leadSecondary = c.whyLeadSecondary,
  items = DEFAULT_ITEMS,
}: {
  title?: string;
  titleAccent?: string;
  lead?: string;
  leadSecondary?: string;
  items?: readonly WhyRailItem[];
} = {}) {
  const ref = useRef<HTMLElement>(null);

  useGsap(
    ({ scope, reduced }) => {
      if (reduced) return;

      const viewport = scope.querySelector<HTMLElement>('.rail__viewport');
      const track = scope.querySelector<HTMLElement>('.rail__track');
      const progress = scope.querySelector<HTMLElement>('.rail__progress-fill');
      const counter = scope.querySelector<HTMLElement>('.rail__counter-now');
      const cards = gsap.utils.toArray<HTMLElement>('.rail__card', scope);
      if (!viewport || !track || cards.length === 0) return;

      // `matchMedia` rather than a bare width check: it tears the pin down and
      // rebuilds it on a real breakpoint crossing, which a one-time `if` at
      // mount would not — rotating a tablet would otherwise leave a pinned
      // section behind on a layout that no longer pins.
      const mm = gsap.matchMedia();

      mm.add('(min-width: 64rem)', () => {
        const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);

        // The card at the head of the rail lifts and its icon fills, so the
        // rail has a focal point instead of reading as a uniform conveyor.
        let active = 0;
        cards[0]?.classList.add('is-active');

        const tween = gsap.to(track, {
          // RTL: the flex row lays out right-to-left, so card 1 sits at the
          // right edge and the overflow spills off-screen to the LEFT. Pulling
          // it into view therefore means translating the track in the POSITIVE
          // direction — the opposite of the LTR case, and the reason this is
          // spelled out rather than left as a bare `-distance()`.
          x: () => distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: scope,
            start: 'top top',
            // The pin lasts exactly as long as there is rail left to travel.
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            // Re-measured on resize and on font load, so the end point follows
            // the real content width instead of a stale one.
            invalidateOnRefresh: true,
            anticipatePin: 1,
            onUpdate: (self) => {
              if (progress) progress.style.transform = `scaleX(${self.progress})`;

              // ONE index drives both the counter and the spotlight. Deriving
              // them separately — a counter from scroll progress and a
              // highlight from per-card triggers — is how they end up
              // disagreeing, with the label reading "1 / 8" while the second
              // card is lit.
              const index = Math.min(
                cards.length - 1,
                Math.floor(self.progress * cards.length),
              );
              if (index === active) return;
              cards[active]?.classList.remove('is-active');
              cards[index]?.classList.add('is-active');
              active = index;
              if (counter) counter.textContent = String(index + 1);
            },
          },
        });

        return () => {
          for (const card of cards) card.classList.remove('is-active');
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });

      return () => mm.revert();
    },
    ref,
    [],
  );

  return (
    <section className="site-section site-section--tint rail" ref={ref}>
      <div className="rail__inner">
        <header className="rail__head">
          <h2 className="site-h2">
            {title} {titleAccent ? <span className="site-accent">{titleAccent}</span> : null}
          </h2>
          {lead ? <p className="site-lead">{lead}</p> : null}
          {leadSecondary ? <p className="rail__lead-2">{leadSecondary}</p> : null}
        </header>

        {/*
          Focusable, and labelled. Below the pin breakpoint this element is a
          real horizontal scroller (`overflow-x: auto`), and a scroll container
          that cannot take focus is unreachable for anyone driving the page from
          the keyboard — they can see card 1 and never reach card 8. `tabIndex`
          gives them the arrow keys; the label tells them what they have landed
          in. Above the breakpoint it is one harmless extra stop on a region
          that holds eight headings.
        */}
        <div className="rail__viewport" tabIndex={0} role="group" aria-label={c.whyListLabel}>
          <ol className="rail__track">
            {items.map((item, i) => (
              <li className="rail__card" key={`${item.titleAr}-${i}`}>
                <span className="rail__n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="rail__icon" aria-hidden="true">
                  {ICONS[i % ICONS.length]}
                </span>
                <h3 className="rail__card-title">{item.titleAr}</h3>
                <p className="rail__card-body">{item.bodyAr}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="rail__progress" aria-hidden="true">
          <span className="rail__progress-fill" />
          <span className="rail__counter">
            <b className="rail__counter-now">1</b> / {items.length}
          </span>
        </div>
      </div>
    </section>
  );
}
