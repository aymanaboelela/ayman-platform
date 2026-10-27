import { BookOpenCheck, CalendarX2, ClipboardX, FileWarning, Hourglass, MonitorPlay } from 'lucide-react';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import type { AttentionItem } from '@/lib/guardian-view';
import { GuardianClearArt } from './guardian-art';

const ICON: Record<AttentionItem['kind'], typeof CalendarX2> = {
  subscription: CalendarX2,
  homework: ClipboardX,
  marks: FileWarning,
  lectures: MonitorPlay,
  quizzes: BookOpenCheck,
  activity: Hourglass,
};

/**
 * «محتاج متابعة» — the block a worried parent scrolls for. It sits right under
 * the figures, never at the bottom, and it is never absent: with nothing to
 * flag it turns into a green «كله تمام», because a page that just stops is
 * read as «مش عارفين».
 */
export function GuardianAttention({ items }: { items: readonly AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <section className="gd-clear" aria-labelledby="gd-clear-title">
        <GuardianClearArt />
        <div>
          <h2 id="gd-clear-title" className="gd-clear__title">
            {c.attention.clearTitle}
          </h2>
          <p className="gd-clear__body">{c.attention.clearBody}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="gd-attention" aria-labelledby="gd-attention-title">
      <header className="gd-attention__head">
        <h2 id="gd-attention-title" className="gd-attention__title">
          {c.attention.title}
        </h2>
        <p className="gd-attention__lead">{c.attention.lead}</p>
      </header>
      <ul className="gd-attention__list">
        {items.map((item) => {
          const Icon = ICON[item.kind];
          return (
            <li key={item.key} className="gd-alert" data-tone={item.tone}>
              <span className="gd-alert__icon" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="gd-alert__text">
                <span className="gd-alert__title">{item.title}</span>
                {item.detail ? <span className="gd-alert__detail">{item.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
