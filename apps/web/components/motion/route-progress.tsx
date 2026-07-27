'use client';

import { ProgressProvider } from '@bprogress/next/app';
import type { ReactNode } from 'react';

/**
 * A 2px amber bar at the top of the viewport during App Router navigations.
 *
 * `showSpinner: false` — the spinner is the nprogress default and reads as a
 * 2013 template. The bar alone is the signal.
 *
 * `shallowRouting` keeps the bar quiet when only the query string changes, which
 * matters because the admin tables drive their filters through `nuqs`: without
 * it, every keystroke in a filter box flashes a progress bar.
 *
 * The colour is read from the design token, so it follows the theme swap with
 * no second source of truth.
 */
export function RouteProgress({ children }: { children: ReactNode }) {
  return (
    <ProgressProvider
      height="2px"
      color="var(--a-9)"
      options={{ showSpinner: false }}
      shallowRouting
    >
      {children}
    </ProgressProvider>
  );
}
