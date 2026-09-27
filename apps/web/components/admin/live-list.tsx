'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveQueue } from '@ayman/contracts/notifications';
import { formatCopy } from '@ayman/contracts/format';
import { useLiveQueue } from './use-live-queue';

/** How long a row that just arrived keeps its accent — long enough to be
 *  noticed by someone who glanced away, short enough not to become the list's
 *  normal colour on a busy day. */
export const FRESH_MS = 20_000;

const NONE: ReadonlySet<string> = new Set();

interface Page {
  rows: readonly { id: string }[];
  rowCount: number;
}

/**
 * One admin list, server-rendered, then kept live — the state half of
 * `/admin/payments` and `/admin/transfers`.
 *
 * `initial` is what the page's server component read. `read` fetches the SAME
 * query again from the browser, through the same guarded endpoint — so a row
 * the admin may not see never reaches the page by this route either.
 *
 * ## Why re-read the rows here, rather than `router.refresh()`
 *
 * A refresh re-renders the whole admin shell — the session read, the bell's
 * count, the page — which is three requests on the admin's own 60-a-minute
 * budget for every frame, and a 429 on the page's own read throws the whole
 * screen into the error boundary. One read of one list, whose failure just
 * leaves the rows already on screen, is the cheaper and the safer answer.
 *
 * ## Two sources, and the newer one wins
 *
 * The admin's own «وافق» still goes through a Server Action that refreshes the
 * route, so `initial` changes under this component too. That render is newer
 * than any browser read that STARTED before it landed, and such a read is
 * thrown away rather than allowed to paint an approved claim back as pending.
 *
 * ## `fresh`
 *
 * Ids that were not on screen a moment ago. A filter or page change remounts
 * the list (the page keys it on its query), so switching «قيد المراجعة» to
 * «الكل» does not light up fifty rows as new.
 */
export function useLiveList<P extends Page>(
  queue: LiveQueue,
  initial: P,
  read: (signal: AbortSignal) => Promise<P>,
): {
  data: P;
  fresh: ReadonlySet<string>;
  live: boolean;
  request: () => void;
} {
  const [data, setData] = useState(initial);
  const [source, setSource] = useState(initial);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(NONE);
  // Counts server renders, so a browser read can tell whether one landed
  // while it was in flight. A counter rather than a clock: the router hiding
  // and re-showing the page re-runs effects without any new render arriving.
  const [generation, setGeneration] = useState(0);

  // A server render landed (the admin's own action refreshed the route). The
  // documented "adjust state when a prop changes" pattern: during render, so
  // the stale rows never paint for a frame.
  if (initial !== source) {
    const before = new Set(data.rows.map((row) => row.id));
    const added = initial.rows.filter((row) => !before.has(row.id)).map((row) => row.id);
    setSource(initial);
    setData(initial);
    setGeneration((current) => current + 1);
    if (added.length > 0) setFresh((previous) => new Set([...previous, ...added]));
  }

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const generationRef = useRef(generation);
  useEffect(() => {
    generationRef.current = generation;
  }, [generation]);

  const againRef = useRef<() => void>(() => undefined);

  const sync = useCallback(
    async (signal: AbortSignal) => {
      const startedIn = generationRef.current;
      const next = await read(signal);
      if (signal.aborted) return;
      // A server render replaced the rows while this was in flight, and this
      // read may predate it — drop it and read once more rather than paint
      // an approved claim back as pending.
      if (generationRef.current !== startedIn) {
        againRef.current();
        return;
      }
      const before = new Set(dataRef.current.rows.map((row) => row.id));
      const added = next.rows.filter((row) => !before.has(row.id)).map((row) => row.id);
      setData(next);
      if (added.length > 0) setFresh((previous) => new Set([...previous, ...added]));
    },
    [read],
  );

  const { live, request } = useLiveQueue(queue, sync);
  useEffect(() => {
    againRef.current = request;
  }, [request]);

  // One timer for the whole batch: every arrival restarts it, and the accent
  // leaves all the new rows together.
  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = setTimeout(() => setFresh(NONE), FRESH_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  return { data, fresh, live, request };
}

/**
 * The strip above a live list: «مباشر» while the stream is up, and — when rows
 * arrived — how many, with a button that scrolls to the first one. An
 * `aria-live` region, so a screen reader hears the arrival too.
 */
export function LiveStrip({
  live,
  liveLabel,
  liveHint,
  arrived,
  showLabel,
  onShow,
}: {
  live: boolean;
  liveLabel: string;
  liveHint: string;
  /** The arrival sentence, or `null` when nothing new is on screen. */
  arrived: string | null;
  showLabel: string;
  onShow: () => void;
}) {
  return (
    <div className="live-strip" aria-live="polite">
      {live ? (
        <span className="live-chip" title={liveHint}>
          <span className="live-chip__dot" aria-hidden />
          {liveLabel}
        </span>
      ) : null}
      {arrived ? (
        <span className="live-arrivals">
          {arrived}
          <button type="button" className="live-arrivals__show" onClick={onShow}>
            {showLabel}
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** «وصل طلب جديد» / «وصل طلبين جداد» / «وصل ٣ طلبات جديدة». */
export function arrivalPhrase(
  count: number,
  forms: { one: string; two: string; many: string },
): string | null {
  if (count <= 0) return null;
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  return formatCopy(forms.many, { n: count });
}

/** Brings the first highlighted row of `list` into view — gently, unless the
 *  reader asked the system for no motion. */
export function scrollToFirstFresh(list: HTMLElement | null): void {
  const row = list?.querySelector<HTMLElement>('[data-fresh]');
  if (!row) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
}
