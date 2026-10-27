import { CalendarClock, GraduationCap, Sparkles } from 'lucide-react';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianView } from '@ayman/contracts/guardian-view';
import { weekExtras, weekSentence, whenLabel } from '@/lib/guardian-view';
import { GuardianHeroArt } from './guardian-art';

/**
 * The band at the top: who this page is about, how the week went in one
 * sentence, and when the student was last on the platform.
 *
 * Painted from the viz layer (`guardian.css`), dark in both themes like the
 * other heroes on the platform, with a drawing at its inline end — a page a
 * parent opens to be reassured should look like a report someone made for
 * them, not a table.
 */
export function GuardianHero({ view, now }: { view: GuardianView; now: Date }) {
  const last = whenLabel(view.lastActivityAt, now);
  const extras = weekExtras(view);
  const chips = [view.student.yearLabel, view.student.trackLabel].filter((value): value is string => Boolean(value));

  return (
    <section className="gd-hero" aria-labelledby="gd-hero-name">
      <div className="gd-hero__shapes" aria-hidden="true">
        <span className="gd-shape gd-shape--ring" />
        <span className="gd-shape gd-shape--blob" />
      </div>

      <div className="gd-hero__body">
        <p className="gd-hero__eyebrow">
          <Sparkles className="size-4" aria-hidden="true" />
          {c.hero.eyebrow}
        </p>
        <h1 id="gd-hero-name" className="gd-hero__name">
          {view.student.name}
        </h1>

        {chips.length > 0 ? (
          <ul className="gd-hero__chips">
            {chips.map((chip) => (
              <li key={chip} className="gd-hero__chip">
                <GraduationCap className="size-4" aria-hidden="true" />
                {chip}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="gd-hero__week">{weekSentence(view)}</p>
        {extras.length > 0 ? <p className="gd-hero__extras">{extras.join(' · ')}</p> : null}

        <p className="gd-hero__last">
          <CalendarClock className="size-4" aria-hidden="true" />
          {last ? formatCopy(c.hero.lastActive, { when: last }) : c.hero.neverActive}
        </p>
      </div>

      <div className="gd-hero__art">
        <GuardianHeroArt />
      </div>
    </section>
  );
}
