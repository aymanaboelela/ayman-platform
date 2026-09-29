'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Closer than this to the newest message counts as «at the bottom» — close
 * enough that a new message should carry the reader along with it.
 */
export const NEAR_LATEST_PX = 96;

/** The newest message the viewport knows about — or `null` for none. */
export interface ChatLatest {
  /** Anything that changes when the last bubble changes — usually its id. */
  key: string;
  /** Its `createdAt`, so a DELETE of the last message is not «a new one». */
  at: string;
  /** Written by whoever is looking at this screen. */
  fromSelf: boolean;
}

/**
 * How far the reader is from the newest message, in px.
 *
 * The scroller is `flex-direction: column-reverse` (see `.chat-scroller` in
 * `chat.css`), so its scroll ORIGIN is the bottom edge: `scrollTop` is 0 at the
 * newest message and grows negative going up. `Math.abs` rather than a sign
 * test keeps this right in the one engine that ever reported it positive.
 */
export function distanceFromLatest(scroller: HTMLElement): number {
  return Math.abs(scroller.scrollTop);
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Keeps a chat on its newest message — the whole of «بيجيلي الشات من فوق مش
 * من آخر حاجة مبعوتة».
 *
 * ## Landing at the bottom is CSS, not this hook
 *
 * The scroller is `column-reverse`, whose scroll origin is its END — so the
 * browser opens it on the newest message on its own, in the server's HTML,
 * before a byte of JavaScript runs. A `scrollTop = scrollHeight` in an effect
 * can only move the view AFTER something has been painted, which is the jump
 * he was describing; and in the admin the page used to scroll as a whole,
 * which Next's own scroll-to-top on navigation then undid.
 *
 * The same property keeps it there as the thread grows under the reader — a
 * photo decoding, a voice note's card, a reply arriving — because growth at
 * the origin does not move the view.
 *
 * ## What is left for this hook
 *
 *  - A NEW message when the reader has scrolled up to read something older.
 *    Their own is followed (they just pressed send; they want to see it land);
 *    someone else's is counted instead, and the view stays where they are
 *    reading. The count is the badge on the «آخر الرسايل» button.
 *  - Whether to offer that button at all.
 */
export function useChatScroll(
  scrollerRef: RefObject<HTMLElement | null>,
  latest: ChatLatest | null,
): { atLatest: boolean; unseen: number; jumpToLatest: () => void } {
  const [atLatest, setAtLatest] = useState(true);
  /*
   * The newest message this viewport has already accounted for, and how many
   * arrived after it while the reader was up the thread.
   *
   * Adjusted DURING render when `latest` changes — React's documented way to
   * derive state from a changed prop — rather than in an effect, which would
   * paint the stale count first and then correct it (and is exactly what
   * `react-hooks/set-state-in-effect` exists to refuse).
   */
  const [tracked, setTracked] = useState<{ key: string | null; at: string | null; unseen: number }>(
    { key: latest?.key ?? null, at: latest?.at ?? null, unseen: 0 },
  );
  if (latest && latest.key !== tracked.key) {
    const isNewer = tracked.at === null || latest.at > tracked.at;
    const counts = isNewer && !latest.fromSelf && !atLatest;
    setTracked({ key: latest.key, at: latest.at, unseen: counts ? tracked.unseen + 1 : tracked.unseen });
  }

  /*
   * The scroll listener writes this as well as the state: the layout effect
   * below has to know where the reader was at the moment a message landed,
   * and a state value read there is one render behind a fast flick.
   */
  const atLatestRef = useRef(true);
  const previousKey = useRef<string | null>(latest?.key ?? null);

  const jumpToLatest = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    function onScroll() {
      if (!scroller) return;
      const near = distanceFromLatest(scroller) <= NEAR_LATEST_PX;
      atLatestRef.current = near;
      setAtLatest(near);
      // Reaching the bottom IS reading what was waiting there.
      if (near) setTracked((current) => (current.unseen === 0 ? current : { ...current, unseen: 0 }));
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollerRef]);

  /*
   * Layout, not passive: the move has to be decided before the new bubble is
   * painted, or it is painted once out of view and then slides in.
   */
  useLayoutEffect(() => {
    const key = latest?.key ?? null;
    if (key === previousKey.current) return;
    previousKey.current = key;
    const scroller = scrollerRef.current;
    if (!scroller || !latest) return;
    if (latest.fromSelf || atLatestRef.current) {
      // Already at the origin is the common case, and `scrollTo(0)` there is a
      // no-op — no event, no motion.
      if (distanceFromLatest(scroller) > 0) {
        scroller.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }
  }, [latest, scrollerRef]);

  return { atLatest, unseen: tracked.unseen, jumpToLatest };
}
