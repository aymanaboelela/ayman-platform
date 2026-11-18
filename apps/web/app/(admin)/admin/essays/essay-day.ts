/** «الاثنين ١٠ مارس» from a `YYYY-MM-DD` key — read as UTC so the key's own day is the day shown. */
const dayFormatter = new Intl.DateTimeFormat('ar-EG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function essayDayLabel(day: string): string {
  return dayFormatter.format(new Date(`${day}T00:00:00Z`));
}
