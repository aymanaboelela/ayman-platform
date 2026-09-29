import Link from 'next/link';
import { BookOpen, ClipboardCheck, TrendingUp } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { ScoreGauge } from './score-gauge';

const c = copy.results;

/**
 * `/results` before the first graded exam — the state EVERY new student is
 * in, so it is designed rather than deferred.
 *
 * It previews the page it is standing in for: the same gauge, drawn empty
 * with its two lines already marked, so the student sees what will fill in and
 * where 50 and 90 sit on it before there is a number to put there. Under it,
 * the three steps between here and a first score — a real sequence, which is
 * why they are numbered — and the one way forward, to the path.
 *
 * The steps are nouns («مذاكرة الدرس»), not instructions («ذاكر»): an
 * imperative has a masculine and a feminine form, and the platform never asks
 * which one it is talking to.
 */
export function ResultsEmpty() {
  const steps = [
    { icon: BookOpen, label: c.emptyStep1 },
    { icon: ClipboardCheck, label: c.emptyStep2 },
    { icon: TrendingUp, label: c.emptyStep3 },
  ];

  return (
    <section className="rs-card rs-empty" aria-labelledby="rs-empty-title">
      <div className="rs-empty__gauge">
        <ScoreGauge percent={null} band={null} label={c.statAverage} tone="surface" />
      </div>

      <div className="rs-empty__body">
        <h2 id="rs-empty-title" className="rs-empty__title">
          {c.emptyTitle}
        </h2>
        <p className="rs-empty__text">{c.emptyBody}</p>

        <ol className="rs-steps">
          {steps.map(({ icon: Icon, label }, index) => (
            <li key={label} className="rs-step">
              <span className="rs-step__num rs-ltr" aria-hidden="true">
                {index + 1}
              </span>
              <Icon className="rs-step__icon size-4" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>

        <Link href="/path" className="chip chip--solid rs-empty__cta">
          {c.emptyCta}
        </Link>
      </div>
    </section>
  );
}
