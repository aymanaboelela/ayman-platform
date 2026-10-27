/**
 * The one video playing on the lesson page, for the notes panel beside it.
 *
 * «ملاحظاتي» needs two things from the player: the second it is at (to pin a
 * note) and a way to go to a second (to play from a note). The player is a
 * 1,300-line component with three sources behind it — YouTube's API, our own
 * HLS copy, and a plain embed with no API at all — and threading two callbacks
 * through its props for a sibling panel would couple the two for good.
 *
 * So the player publishes a handle here while it can answer, and withdraws it
 * when it cannot; the panel subscribes. A plain embed never publishes, and
 * the panel simply offers no «on this minute» there — that is the honest
 * answer for a frame we cannot read.
 */
export interface PlayerHandle {
  /** The second the video is at, or `null` when it cannot say. */
  now(): number | null;
  /** Go to `seconds` and play — starting the player if it is still a poster. */
  seek(seconds: number): void;
}

let current: PlayerHandle | null = null;
const listeners = new Set<() => void>();

export function publishPlayer(handle: PlayerHandle | null): void {
  current = handle;
  for (const listener of listeners) listener();
}

export function currentPlayer(): PlayerHandle | null {
  return current;
}

/** `useSyncExternalStore`-shaped. */
export function subscribePlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
