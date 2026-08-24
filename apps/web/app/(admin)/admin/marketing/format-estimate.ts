/**
 * Minutes → a duration a person reads in one glance.
 *
 * Shared by the audience preview (before a campaign exists) and the detail
 * screen (while one is running), both of which show the SAME number computed
 * by `estimateMinutes` — the contract module already does the arithmetic;
 * this is only the last step of turning it into Arabic prose.
 *
 * Deliberately coarse. `estimateMinutes` is itself an estimate — see its own
 * note — and rendering it to the minute would claim a precision the pacing
 * math does not have. Under an hour shows minutes; under two days shows
 * hours; anything longer rounds to the nearest day, because a campaign
 * measured in days is a campaign whose exact hour does not matter.
 */
export function formatEstimate(minutes: number): string {
  if (minutes <= 0) return 'أقل من دقيقة';
  if (minutes < 60) return `${minutes} دقيقة`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? 'حوالي ساعة' : hours === 2 ? 'حوالي ساعتين' : `حوالي ${hours} ساعة`;

  const days = Math.round(minutes / 1440);
  if (days === 1) return 'حوالي يوم';
  if (days === 2) return 'حوالي يومين';
  if (days <= 10) return `حوالي ${days} أيام`;
  return `حوالي ${days} يوم`;
}
