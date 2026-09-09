/**
 * The two clocks «امتحانات الشهر» has to keep straight, and the one mistake
 * that cannot be undone at 19:45.
 *
 * ## The mistake
 *
 * A `datetime-local` input has NO timezone. It shows, and returns, whatever the
 * BROWSER thinks the local wall clock is. Every student sits the exam on Cairo
 * time, and the platform stores UTC — so an exam typed as `20:00` on a machine
 * that is not on `Africa/Cairo` opens at 17:00 or 23:00 and looks exactly like
 * a broken deploy. There is no recovering from it once a cohort has arrived.
 *
 * So the form prints the chosen instant BACK, in Cairo, before he submits.
 * `windowEcho` in the copy table is that sentence, and `formatCairo` below is
 * what fills it.
 *
 * ## Why `Intl` with an explicit `timeZone` and not a fixed +2/+3
 *
 * Egypt observes DST again — the clocks are on UTC+3 until the last Thursday of
 * October and UTC+2 after it. A hand-rolled offset is therefore wrong for part
 * of every year, and wrong SILENTLY: it would print a confident, incorrect
 * confirmation of the exact value it exists to double-check. `Intl` carries the
 * IANA rules, so this stays right through the switch without anyone touching it.
 */

/**
 * ⚠️ These two are `quiz-settings-form.tsx`'s own `toLocalInputValue` /
 * `fromLocalInputValue`, VERBATIM, and they must stay that way — the quiz
 * settings form and this screen write `quizzes.open_from` / `open_until`, the
 * same two columns, and two different round-trips would mean two different
 * instants for one exam depending on which screen last saved it.
 *
 * They live here rather than being imported from there because that module is
 * a `'use client'` component that does not export them; extracting them is a
 * change to a file this pass does not own. If it is ever refactored, this file
 * should import from it and delete the pair.
 *
 * The offset dance is not decoration: `date.toISOString().slice(0, 16)` alone
 * yields the UTC wall clock, which `datetime-local` then presents as if it were
 * local — silently shifting every stored time by the browser's own offset.
 */
export function toLocalInputValue(date: Date | null): string {
  if (!date) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromLocalInputValue(value: string): Date | null {
  return value ? new Date(value) : null;
}

/**
 * The echo's own format — long enough that a wrong DAY is as obvious as a wrong
 * hour, which is the other half of the mistake this guards against.
 *
 * `ar-EG-u-nu-latn`: Arabic month and weekday names, WESTERN digits. Same rule
 * every date on this platform follows (see `admin/audit/columns.tsx` and
 * `admin/books/page.tsx`), and here it matters twice over — «٢٠:٠٠» in
 * Eastern-Arabic numerals is measurably slower to check than «20:00».
 *
 * `hourCycle: 'h23'` so there is no ص/م to misread: 8 in the evening is 20:00
 * and nothing else.
 */
const CAIRO_WALL_CLOCK = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The same instant, in Cairo. Nothing on these screens prints a time any
 *  other way — an admin abroad and an admin in Cairo must read one number. */
export function formatCairo(date: Date): string {
  return CAIRO_WALL_CLOCK.format(date);
}

/** The row's compact twin: no weekday, because a list of eight exams is scanned
 *  for «إمتى» and the day name is three words of noise per line. */
const CAIRO_SHORT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatCairoShort(iso: string): string {
  return CAIRO_SHORT.format(new Date(iso));
}
