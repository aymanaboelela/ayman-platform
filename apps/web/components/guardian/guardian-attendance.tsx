import { MapPin } from 'lucide-react';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianView } from '@ayman/contracts/guardian-view';
import { formatDate } from '@/lib/guardian-view';
import { SectionHead } from './section-head';

/**
 * «الحضور في السنتر» — only for a student who was ever booked into a centre
 * (the API sends `null` otherwise: an online student has no attendance, which
 * is not «غياب ٠»). The two figures, then the last few classes as a strip.
 */
export function GuardianAttendance({ attendance }: { attendance: NonNullable<GuardianView['attendance']> }) {
  return (
    <section className="gd-section" data-tone="attendance" aria-labelledby="gd-attendance">
      <SectionHead
        id="gd-attendance"
        title={c.attendance.title}
        aside={
          attendance.centerName ? (
            <span className="gd-section__note">
              <MapPin className="size-4" aria-hidden="true" />
              {formatCopy(c.attendance.center, { name: attendance.centerName })}
            </span>
          ) : null
        }
      />
      <div className="gd-attend">
        <div className="gd-attend__fig" data-status="present">
          <span className="gd-num">{attendance.attended}</span>
          <span>{c.attendance.present}</span>
        </div>
        <div className="gd-attend__fig" data-status="absent">
          <span className="gd-num">{attendance.absent}</span>
          <span>{c.attendance.absent}</span>
        </div>
        {attendance.recent.length > 0 ? (
          <ol className="gd-attend__strip">
            {attendance.recent.map((entry) => (
              <li key={`${entry.date}:${entry.centerName}`} data-status={entry.status}>
                <span className="gd-attend__day">{formatDate(`${entry.date}T12:00:00Z`)}</span>
                <span className="gd-attend__mark">{c.attendance[entry.status]}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
