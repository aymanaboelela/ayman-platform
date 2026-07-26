import type { ReactNode } from 'react';

/**
 * Shell for authenticated app routes. Deliberately a passthrough with no
 * `<main>` and no width constraint of its own — matching the `(site)` route
 * group's convention (no shared layout at all; every top-level page owns its
 * own `<main>` + width).
 *
 * This used to hardcode `<main className="max-w-2xl px-6 py-16">` for
 * onboarding. That width is right for a short form but wrong for the player
 * (Task 10) and the dashboard (Task 11), both of which need the same
 * `--w-shell` (1152px) two-column width every other top-level page in this
 * app uses — a shared ancestor `<main>` here would either double up the
 * `<main>` landmark (invalid — two on one page) or squeeze the player's
 * outline sidebar into 672px. `onboarding/page.tsx`,
 * `onboarding/loading.tsx` and `settings/devices/page.tsx` now each carry
 * their own `<main className="mx-auto max-w-2xl px-6 py-16">` instead, so
 * their presentation is unchanged.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
