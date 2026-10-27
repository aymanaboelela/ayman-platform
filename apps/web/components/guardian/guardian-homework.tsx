import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianHomeworkItem, GuardianView } from '@ayman/contracts/guardian-view';
import { mark, whenLabel } from '@/lib/guardian-view';
import { GuardianEmptyArt } from './guardian-art';
import { SectionHead } from './section-head';

const VISIBLE = 6;
const ORDER = ['missing', 'needs_work', 'submitted', 'accepted'] as const;

/**
 * Every lecture with homework, newest first, as a timeline: one dot per
 * lecture, coloured by where its homework stands. The four counts above it are
 * the same four the dots are coloured by, so «٢ متسلّمش» is two red dots.
 */
export function GuardianHomework({ homework, now }: { homework: NonNullable<GuardianView['homework']>; now: Date }) {
  const counts = {
    missing: homework.missing,
    needs_work: homework.needsWork,
    submitted: homework.submitted,
    accepted: homework.accepted,
  };

  return (
    <section className="gd-section" data-tone="homework" aria-labelledby="gd-homework">
      <SectionHead id="gd-homework" title={c.homework.title} />
      {homework.items.length === 0 ? (
        <div className="gd-empty">
          <GuardianEmptyArt />
          <p className="gd-empty__title">{c.homework.emptyTitle}</p>
          <p className="gd-empty__body">{c.homework.emptyBody}</p>
        </div>
      ) : (
        <>
          <ul className="gd-hw-counts">
            {ORDER.map((status) => (
              <li key={status} data-status={status}>
                <span className="gd-hw-counts__n gd-num">{counts[status]}</span>
                <span>{c.homework.status[status]}</span>
              </li>
            ))}
          </ul>
          <ol className="gd-timeline">
            {homework.items.slice(0, VISIBLE).map((item) => (
              <HomeworkRow key={item.lessonId} item={item} now={now} />
            ))}
          </ol>
          {homework.items.length > VISIBLE ? (
            <details className="gd-more">
              <summary>{formatCopy(c.homework.showAll, { count: homework.items.length })}</summary>
              <ol className="gd-timeline">
                {homework.items.slice(VISIBLE).map((item) => (
                  <HomeworkRow key={item.lessonId} item={item} now={now} />
                ))}
              </ol>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function HomeworkRow({ item, now }: { item: GuardianHomeworkItem; now: Date }) {
  const when = whenLabel(item.submittedAt, now);
  return (
    <li className="gd-timeline__item" data-status={item.status}>
      <span className="gd-timeline__dot" aria-hidden="true" />
      <span className="gd-timeline__body">
        <span className="gd-timeline__title">{item.lessonTitle}</span>
        <span className="gd-timeline__meta">
          {item.courseTitle}
          {when ? ` · ${formatCopy(c.homework.handedIn, { when })}` : ''}
        </span>
      </span>
      <span className="gd-timeline__status">
        <span className="gd-status" data-status={item.status}>
          {c.homework.status[item.status]}
        </span>
        {item.grade !== null ? (
          <span className="gd-timeline__grade">{formatCopy(c.homework.grade, { grade: mark(item.grade) })}</span>
        ) : null}
      </span>
    </li>
  );
}
