'use client';

import { startTransition, use, useEffect, useState } from 'react';
import { navigationWasHeld, registerNavigationHold } from '@/lib/stale-navigation';

/** Never settles. At module scope, so every render suspends on the same one. */
const NEVER = new Promise<never>(() => {});

/**
 * Renders nothing, and while a stale tab is loading its next page as a
 * document, suspends that soft navigation so it never commits.
 * `lib/stale-navigation.ts` explains why. Mounted once, in the root layout.
 *
 * The update that suspends is queued in a transition, inside the router's own
 * transition. React renders the two together, and a transition never hides
 * content already on screen, so the page stays as it is, interactive, until
 * the new document replaces it. It is never committed, so nothing else ever
 * renders it.
 *
 * ⚠️ It never lets go. Releasing the hold would commit the very navigation it
 * held, the old build rendering the target. So when the browser brings this
 * document back from its back-forward cache, still holding and still on the
 * old build, it is loaded fresh. A browser without that cache would have done
 * the same.
 *
 * Someone who answers «stay» to a leave-page prompt (the course editor's
 * unsaved-edit warning) stays on this page, as they asked, and their next
 * navigation tries the document load again. Until then, other transitions on
 * the page wait behind the held one, while ordinary updates such as typing
 * still commit. Next's own document-load navigations behave exactly the same.
 */
export function StaleNavigationHold(): null {
  const [held, setHeld] = useState(false);

  useEffect(() => registerNavigationHold(() => startTransition(() => setHeld(true))), []);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && navigationWasHeld()) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  if (held) use(NEVER);
  return null;
}
