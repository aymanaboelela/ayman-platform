/**
 * The one number formatter «الترمينال» needs that the platform did not already
 * have.
 *
 * `formatEGP`, `formatMark` and `formatCopy` are reused from where they live —
 * a preset that reformats a price is a preset that quotes a different figure
 * from the shop one click away. This is the exception, and it exists because
 * the classic surfaces format a duration as WORDS (`formatDuration` in
 * `components/site/course-card.tsx` returns «8 ساعة 45 دقيقة») and this page
 * needs a clock.
 */

/**
 * Seconds → `hh:mm`, zero-padded, always two fields.
 *
 * See `META.runtime` for why: the meta values have to line up down a card —
 * that is the entire reason the rows are a dotted leader and not chips — and a
 * phrase whose length depends on whether the course happens to have round
 * hours cannot line up with anything. `08:45` is also exact, where a rounded
 * «9 ساعة» on an 8h45 course is not.
 *
 * Minutes are ROUNDED rather than floored so a 59.6-minute course reads
 * `01:00` and not `00:59`, and the carry is handled explicitly: rounding 3,599
 * seconds gives 60 minutes, and `00:60` is not a time.
 *
 * Hours are NOT capped at two digits. A whole catalogue's total runtime is
 * three digits (`120:30`) and truncating it would be a lie about the one
 * figure the section exists to state.
 */
export function runtime(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
