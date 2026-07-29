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

type Feature = { icon: React.ReactNode; title: string; body: string };

const COLUMN_A: Feature[] = [
  { icon: <Dumbbell size={22} />, title: c.why3Title, body: c.why3Body },
  { icon: <LineChart size={22} />, title: c.why4Title, body: c.why4Body },
  { icon: <Award size={22} />, title: c.why7Title, body: c.why7Body },
  { icon: <Lightbulb size={22} />, title: c.why8Title, body: c.why8Body },
];

const COLUMN_B: Feature[] = [
  { icon: <Flag size={22} />, title: c.why1Title, body: c.why1Body },
  { icon: <Code2 size={22} />, title: c.why2Title, body: c.why2Body },
  { icon: <Layers size={22} />, title: c.why5Title, body: c.why5Body },
  { icon: <BookOpenCheck size={22} />, title: c.why6Title, body: c.why6Body },
];

/** Pixels per second. Deliberately different per column so the two never
 *  sync up into a single moving plate. */
const SPEED = [30, 23] as const;

/** Copies of each list stacked in a track. Two would suffice for a seamless
 *  wrap; the third covers the case where one list is shorter than the
 *  viewport, which would otherwise leave a visible gap at the fold. */
const REPEATS = 3;

function List({ items }: { items: Feature[] }) {
  return (
    <ul className="why__list" aria-hidden="true">
      {items.map((f) => (
        <li className="why__item" key={f.title}>
          <span className="why__icon" aria-hidden="true">
            {f.icon}
          </span>
          <h3 className="why__item-title">{f.title}</h3>
          <p className="why__item-body">{f.body}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two columns of feature cards drifting vertically in opposite directions
 * behind a masked viewport.
 *
 * Accessibility: the visible lists are `aria-hidden` and duplicated three
 * times — reading the same four cards nine times is hostile to a screen
 * reader. One flat, static copy is exposed in a visually-hidden list instead,
 * which is also what search engines index.
 */
export function WhyMarquee() {
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    ({ scope, reduced }) => {
      if (reduced) return;

      const columns = Array.from(scope.querySelectorAll<HTMLElement>('.why__col'));
      const tweens: gsap.core.Tween[] = [];

      const build = () => {
        for (const tween of tweens.splice(0)) tween.kill();

        columns.forEach((column, i) => {
          const track = column.querySelector<HTMLElement>('.why__track');
          const list = track?.querySelector<HTMLElement>('.why__list');
          if (!track || !list) return;

          // One list's height is exactly one loop: after translating by it the
          // stacked copies present identical content, so the wrap is invisible.
          const distance = list.offsetHeight;
          if (distance === 0) return;

          const down = i % 2 === 1;
          gsap.set(track, { y: down ? -distance : 0 });

          tweens.push(
            gsap.to(track, {
              y: down ? 0 : -distance,
              duration: distance / SPEED[i % SPEED.length]!,
              ease: 'none',
              repeat: -1,
            }),
          );
        });
      };

      build();

      // Card heights change when the Arabic webfont swaps in and on every
      // reflow; a loop measured against the fallback metrics visibly jumps at
      // the wrap point. Rebuilding on resize is cheap — it happens at most
      // once per font load and per viewport change.
      const observer = new ResizeObserver(build);
      for (const column of columns) observer.observe(column);

      const pause = () => tweens.forEach((t) => t.pause());
      const play = () => tweens.forEach((t) => t.play());
      const viewport = scope.querySelector<HTMLElement>('.why__viewport');
      viewport?.addEventListener('pointerenter', pause);
      viewport?.addEventListener('pointerleave', play);

      return () => {
        observer.disconnect();
        viewport?.removeEventListener('pointerenter', pause);
        viewport?.removeEventListener('pointerleave', play);
      };
    },
    ref,
    [],
  );

  return (
    <section className="site-section site-section--tint">
      <div className="why" ref={ref}>
        <div className="why__copy">
          <h2 className="site-h2">
            {c.whyTitle} <span className="site-accent">{c.whyTitleAccent}</span>
          </h2>
          <p className="site-lead">{c.whyLead}</p>
          <p className="why__lead-2">{c.whyLeadSecondary}</p>
        </div>

        <div className="why__viewport">
          <div className="why__cols">
            {[COLUMN_A, COLUMN_B].map((items, i) => (
              <div className="why__col" key={i}>
                <div className="why__track">
                  {Array.from({ length: REPEATS }, (_, r) => (
                    <List items={items} key={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="why__fade why__fade--top" aria-hidden="true" />
          <div className="why__fade why__fade--bottom" aria-hidden="true" />
        </div>

        {/* The accessible, indexable copy of the same content. */}
        <ul className="sr-only" aria-label={c.whyListLabel}>
          {[...COLUMN_B, ...COLUMN_A].map((f) => (
            <li key={f.title}>
              <strong>{f.title}</strong> — {f.body}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
