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
