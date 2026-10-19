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

/** A stable colour per course, so one course's mistakes read as a group. */
function hueOf(key: string | null): number {
  if (!key) return 1;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 4) + 1;
}

export function MistakeCard({ entry, n }: { entry: MistakeEntry; n: number }) {
  const mastered = entry.streakRight >= MISTAKE_MASTERY_STREAK;
  return (
    <li className="mk-card" data-hue={hueOf(entry.courseSlug ?? entry.courseTitle)}>
      <div className="mk-card__head">
        <span className="mk-card__n">{n}</span>
        {(entry.courseTitle || entry.lessonTitle) && (
          <p className="mk-card__where">
            {entry.courseTitle}
            {entry.courseTitle && entry.lessonTitle ? ' · ' : ''}
            {entry.lessonTitle}
          </p>
        )}
      </div>
      <SafeHtml html={entry.stemHtml} className="mk-card__stem" />
      <div className="mk-card__meta">
        {entry.source === 'game' || entry.source === 'arena' ? (
          <span className="mk-chip" data-tone="source">
            {entry.source === 'game' ? c.fromGame : c.fromArena}
          </span>
        ) : null}
        <span className="mk-chip" data-tone="missed">
          {entry.timesMissed === 1 ? c.missedOnce : formatCopy(c.missedTimes, { n: entry.timesMissed })}
        </span>
        <span className="mk-chip">{formatCopy(c.missedAt, { when: relativeAr(entry.missedAt) })}</span>
        {entry.streakRight > 0 && !mastered && (
          <span className="mk-chip" data-tone="streak">
            {formatCopy(c.streakHint, { have: entry.streakRight, need: MISTAKE_MASTERY_STREAK })}
          </span>
        )}
      </div>
    </li>
  );
}
