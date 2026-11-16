'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import {
  GUIDE_DELAY_MS,
  GUIDE_RETRY_MS,
  GUIDE_SEEN_KEY,
  GUIDE_SPENT_KEY,
  GUIDE_STATE_KEY,
  INITIAL_GUIDE_STATE,
  createVisibleBudget,
  isAutomated,
  isBusy,
  mayResume,
  probeViewer,
  readStored,
  shouldCountDown,
  writeStored,
  type GuideSurface,
} from './guide-gate';

/**
 * The teacher's mark for the guide, resolved on the server (`guide-slot.tsx`)
 * and passed down as plain numbers and a URL — `null` on a stack that has
 * uploaded none, where the guide draws a neutral monogram instead.
 */
export interface GuideFace {
  src: string;
  width: number;
  height: number;
}

export interface GuideRootProps {
  surface: GuideSurface;
  face: GuideFace | null;
  /** The guide ended — the launcher drops it so a later page mounts nothing. */
  onEnd: () => void;
}

/**
 * The only piece of the first-visit guide that is on every page.
 *
 * It renders nothing and imports nothing but `guide-gate.ts`: no copy table,
 * no schema, no stylesheet. For a visitor the guide never shows to — everyone
 * who has seen it once, every enrolled student, every page that is not a
 * landing/catalogue page or a student's home — its whole cost is two
 * `storage` reads on mount. For a new visitor it is those reads plus one
 * `setTimeout` and one `visibilitychange` listener.
 *
 * The guide itself (`guide-root.tsx` and everything under it — the dialog, the
 * helper circle, the stylesheet, the copy, the schemas) is a separate chunk,
 * requested with `import()` in exactly two cases:
 *
 *   1. the visible-time budget ran out on an eligible page AND the one-off
 *      probe says this is a new client;
 *   2. a guide is already in progress in this tab and this page has something
 *      of it to draw (the pill, the dialog, or the helper beside a form).
 *
 * `import()` and not `next/dynamic`: a dynamic component is declared at module
 * scope and its chunk can be preloaded with the route; a bare `import()`
 * inside an effect is requested when the line runs and not before.
 */
export function GuideLauncher({ surface, face }: { surface: GuideSurface; face: GuideFace | null }) {
  const pathname = usePathname();
  const [Root, setRoot] = useState<ComponentType<GuideRootProps> | null>(null);
  // One request for the chunk however many effects ask for it.
  const loading = useRef(false);

  useEffect(() => {
    if (Root !== null) return;

    function load() {
      if (loading.current) return;
      loading.current = true;
      void import('./guide-root').then(
        (module) => setRoot(() => module.GuideRoot),
        () => {
          // A failed chunk (offline, a deploy mid-flight) is a guide that does
          // not appear this time. The next page view may try again.
          loading.current = false;
        },
      );
    }

    const session = safeStorage('sessionStorage');
    const local = safeStorage('localStorage');
    const inProgress = readStored(session, GUIDE_STATE_KEY) !== null;

    // Case 2 — resume. Not gated on `seen` or on automation: this state only
    // exists because somebody started the guide in this tab.
    if (inProgress) {
      if (mayResume(surface, pathname)) load();
      return;
    }

    // Case 1 — the first, automatic appearance.
    if (
      !shouldCountDown({
        surface,
        pathname,
        seen: readStored(local, GUIDE_SEEN_KEY) !== null,
        inProgress,
        automated: isAutomated(navigator),
      })
    ) {
      return;
    }

    let cancelled = false;

    const budget = createVisibleBudget({
      budgetMs: GUIDE_DELAY_MS,
      spentMs: Number(readStored(session, GUIDE_SPENT_KEY)) || 0,
      now: () => Date.now(),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      onSpend: (spent) => writeStored(session, GUIDE_SPENT_KEY, String(Math.round(spent))),
      onDone: () => void open(),
    });

    async function open() {
      // Something else has the visitor right now — ask again in a moment
      // rather than open a modal over it.
      if (isBusy(document)) {
        budget.rewind(GUIDE_RETRY_MS);
        return;
      }

      const result = await probeViewer(surface, (path) =>
        fetch(path, { headers: { accept: 'application/json' }, credentials: 'same-origin' }),
      );
      if (cancelled) return;

      if (result.viewer === null) {
        // Enrolled, staff, a guardian: the answer will not change, so this
        // device stops counting. A failed read leaves everything as it was.
        if (result.settled) writeStored(local, GUIDE_SEEN_KEY, '1');
        return;
      }
      // The probe took a moment; the visitor may have opened something since.
      if (isBusy(document)) {
        budget.rewind(GUIDE_RETRY_MS);
        return;
      }

      // «First time only» is decided HERE, at the moment it appears, not when
      // it is closed: closing, minimising and walking away all leave it seen.
      writeStored(local, GUIDE_SEEN_KEY, '1');
      writeStored(session, GUIDE_STATE_KEY, JSON.stringify(INITIAL_GUIDE_STATE));
      load();
    }

    const sync = () => {
      if (document.visibilityState === 'visible') budget.resume();
      else budget.pause();
    };
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', sync);
      // Leaving the page (or the route group) banks the time spent on it.
      budget.pause();
    };
  }, [surface, pathname, Root]);

  if (Root === null) return null;
  return (
    <Root
      surface={surface}
      face={face}
      onEnd={() => {
        loading.current = false;
        setRoot(null);
      }}
    />
  );
}

function safeStorage(kind: 'sessionStorage' | 'localStorage'): Storage | undefined {
  try {
    return window[kind];
  } catch {
    // Site data blocked: reading the property itself throws.
    return undefined;
  }
}
