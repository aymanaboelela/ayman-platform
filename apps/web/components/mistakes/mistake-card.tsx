import type { MistakeEntry } from '@ayman/contracts/mistakes';
import { MISTAKE_MASTERY_STREAK } from '@ayman/contracts/mistakes';
import { formatCopy } from '@ayman/contracts/format';
import { mistakesCopy } from '@ayman/contracts/copy/mistakes';
import { SafeHtml } from '@/components/content/safe-html';

const c = mistakesCopy.page;

/** تاريخ نسبي بسيط — «امبارح»، «من ٣ أيام» — بلا مكتبة، زي أماكن تانية في
 *  الداشبورد بتعمل نفس الحساب بإيدها. */
function relativeAr(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'النهارده';
  if (days === 1) return 'امبارح';
  if (days < 30) return `من ${days} يوم`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'من شهر' : `من ${months} شهور`;
}

export function MistakeCard({ entry }: { entry: MistakeEntry }) {
  return (
    <li className="panel grid gap-1.5 p-4">
      {(entry.courseTitle || entry.lessonTitle) && (
        <p className="text-xs text-fg-muted">
          {entry.courseTitle}
          {entry.courseTitle && entry.lessonTitle ? ' · ' : ''}
          {entry.lessonTitle}
        </p>
      )}
      <SafeHtml html={entry.stemHtml} className="leading-relaxed text-fg" />
      <div className="flex flex-wrap gap-2.5 text-xs text-fg-muted">
        <span>{entry.timesMissed === 1 ? c.missedOnce : formatCopy(c.missedTimes, { n: entry.timesMissed })}</span>
        <span>{formatCopy(c.missedAt, { when: relativeAr(entry.missedAt) })}</span>
        {entry.streakRight > 0 && (
          <span className="font-bold text-ok">
            {formatCopy(c.streakHint, { have: entry.streakRight, need: MISTAKE_MASTERY_STREAK })}
          </span>
        )}
      </div>
    </li>
  );
}
