'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
// The `/copy` SUBPATH, never the root barrel — this is mounted in the root
// layout, so its imports land on every route. `toaster.tsx` says why.
import { copy } from '@ayman/contracts/copy';
import { watchBuild } from '@/lib/build-watch';
import { isStaleActionError, markTabStale, subscribeStaleTab } from '@/lib/stale-tab';

/**
 * «نزل تحديث للمنصة» — the one place a tab that outlived a deploy is told so.
 *
 * Renders nothing itself; the message is a sonner toast, raised through the
 * single `<Toaster/>` the root layout already mounts, the same way
 * `route-loading-watchdog.tsx` offers its reload. Non-blocking by
 * construction: nothing is covered, nothing is disabled, and whatever the
 * person was typing stays exactly where it was until THEY press the button.
 *
 * Three ways in, one toast out — `lib/stale-tab.ts` explains why they share a
 * flag:
 *
 *   1. `watchBuild` — the server says it is running a different build.
 *   2. `unhandledrejection` / `error` — a Server Action nobody caught failed
 *      because its id is gone.
 *   3. `actionErrorMessage` — a catch site that renders its own failure (the
 *      course editor's autosave) met the same error.
 *
 * `duration: Infinity`: a reload is the only thing that makes the condition go
 * away, so a toast that timed out would be claiming it had.
 *
 * Mounted once, in `app/layout.tsx`, beside `ServiceWorkerRegister`, for every
 * surface and every tenant — the failure is a property of deploying, not of
 * any one screen.
 */
const RUNNING_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const TOAST_ID = 'stale-build';

export function StaleBuildWatch() {
  useEffect(
    () =>
      subscribeStaleTab(() => {
        toast(copy.common.staleBuild, {
          id: TOAST_ID,
          duration: Infinity,
          action: {
            label: copy.common.staleBuildReload,
            onClick: () => window.location.reload(),
          },
        });
      }),
    [],
  );

  useEffect(() => {
    // Not `preventDefault()`: the console line is still worth having for
    // whoever has devtools open, and nothing here claims to have handled it.
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleActionError(event.reason)) markTabStale();
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleActionError(event.error)) markTabStale();
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!RUNNING_BUILD) return;
    return watchBuild({ running: RUNNING_BUILD, onStale: markTabStale });
  }, []);

  return null;
}
