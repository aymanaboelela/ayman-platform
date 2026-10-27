import type { ReactNode } from 'react';
import { ClipboardCheck, FileCheck2, MonitorPlay, Trophy } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianView } from '@ayman/contracts/guardian-view';
import { totals } from '@/lib/guardian-view';

/**
 * Four figures, each in its own colour — the same colour the section it
 * summarises wears further down, so «متوسط الكويزات» in violet points at the
 * violet marks section without a word.
 *
 * An average before the first marked paper reads «لسه مفيش», never «0%».
 */
export function GuardianStats({ view }: { view: GuardianView }) {
  const sum = totals(view);
  const { quizzes, exams } = view.quizzes;

  return (
    <ul className="gd-stats" aria-label={c.meta.title}>
      <Stat
        tone="lectures"
        icon={<MonitorPlay className="size-5" />}
        value={sum.lecturesTotal === 0 ? c.stats.none : `${sum.lecturesDone}/${sum.lecturesTotal}`}
        label={c.stats.lectures}
        note={view.courses.length > 0 ? formatCopy(c.stats.lecturesNote, { count: view.courses.length }) : null}
        meter={sum.lecturesTotal === 0 ? null : sum.lecturesPercent}
      />
      <Stat
        tone="quizzes"
        icon={<FileCheck2 className="size-5" />}
        value={quizzes.average === null ? c.stats.none : `${quizzes.average}%`}
        label={c.stats.quizzes}
        note={quizzes.taken > 0 ? arabicCount(quizzes.taken, c.stats.quizzesNote) : null}
        meter={quizzes.average}
      />
      <Stat
        tone="exams"
        icon={<Trophy className="size-5" />}
        value={exams.average === null ? c.stats.none : `${exams.average}%`}
        label={c.stats.exams}
        note={exams.taken > 0 ? arabicCount(exams.taken, c.stats.examsNote) : null}
        meter={exams.average}
      />
      {view.homework ? (
        <Stat
          tone="homework"
          icon={<ClipboardCheck className="size-5" />}
          value={sum.homeworkTotal === 0 ? c.stats.none : `${sum.homeworkIn}/${sum.homeworkTotal}`}
          label={c.stats.homework}
          note={view.homework.accepted > 0 ? formatCopy(c.stats.homeworkNote, { count: view.homework.accepted }) : null}
          meter={sum.homeworkTotal === 0 ? null : Math.round((sum.homeworkIn / sum.homeworkTotal) * 100)}
        />
      ) : null}
    </ul>
  );
}

function Stat({
  tone,
  icon,
  value,
  label,
  note,
  meter,
}: {
  tone: 'lectures' | 'quizzes' | 'exams' | 'homework';
  icon: ReactNode;
  value: string;
  label: string;
  note: string | null;
  meter: number | null;
}) {
  return (
    <li className="gd-stat" data-tone={tone}>
      <span className="gd-stat__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="gd-stat__value gd-num">{value}</span>
      <span className="gd-stat__label">{label}</span>
      {note ? <span className="gd-stat__note">{note}</span> : null}
      {meter === null ? null : (
        <span className="gd-stat__meter" aria-hidden="true">
          <span style={{ inlineSize: `${Math.min(Math.max(meter, 0), 100)}%` }} />
        </span>
      )}
    </li>
  );
}
