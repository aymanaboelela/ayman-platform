/**
 * Clock formatting. Contains no words, so it is not a copy-table violation —
 * every user-facing *string* still lives in `@ayman/contracts`.
 *
 * Western digits only (§4.1), and callers pair these with the `.tabular`
 * class so a ticking timer does not shift its own layout every second.
 */
function safeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatDuration(totalSeconds: number): string {
  const seconds = safeSeconds(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * "How much is left" reads better rounded up: 61 seconds remaining is "2:00",
 * not "1:01" — nobody thinks of it as one minute and one second.
 */
export function formatRemaining(totalSeconds: number): string {
  const seconds = safeSeconds(totalSeconds);
  if (seconds < 60) return formatDuration(seconds);
  return formatDuration(Math.ceil(seconds / 60) * 60);
}

/**
 * "٨ س ٤٥ د" — a duration in a sentence, not a clock.
 *
 * `formatDuration`'s `H:MM:SS` is right next to a video's own scrubber and
 * wrong in a stat row: "8:45:00" reads as a timestamp, not "eight hours and
 * forty-five minutes of course". Same fix `formatSitting` in
 * `components/profile/activity-feed.tsx` already made for one watch
 * session — this is the same shape, exported for `CourseDetailsCard`'s
 * course-wide total rather than duplicated a second time.
 *
 * Minutes are the grain a student actually thinks in, so seconds are
 * dropped — except a NONZERO remainder rounds UP to one minute rather than
 * vanishing, the same "it demonstrably happened" rule `formatSitting`
 * applies. Zero stays "٠ د": unlike a watch session, a course total can be
 * genuinely zero (no `estimatedSeconds` set yet), and that is a fact worth
 * showing rather than a floor to round away from.
 */
export function formatHoursMinutes(totalSeconds: number): string {
  const seconds = safeSeconds(totalSeconds);
  const minutes = seconds === 0 ? 0 : Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} س` : `${hours} س ${rest} د`;
}

/**
 * An article's date, as a reader sees it — «13 سبتمبر 2026».
 *
 * ⚠️ Added 2026-09-13 because the article header had a `<time>` whose ATTRIBUTE
 * carried the date and whose TEXT was the word «اتنشر» and nothing else. A
 * parser that reads `dateTime` was fine; a reader was not, and neither was any
 * consumer that reads the rendered text — an AI-readiness scan reported the
 * site had no editorial freshness signal at all while every article had a
 * correct `datePublished` in its JSON-LD.
 *
 * `ar-EG-u-nu-latn` — Arabic month names, LATIN digits, the same locale every
 * other formatter in this app uses. See `lib/fonts.ts` for why the digits are
 * Latin: the Arabic-Indic ones fall back to a different face mid-sentence.
 */
const articleDateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'long' });

export function formatArticleDate(iso: string): string {
  const date = new Date(iso);
  // An unparseable timestamp must not take the page down over a byline.
  return Number.isNaN(date.getTime()) ? '' : articleDateFormatter.format(date);
}
