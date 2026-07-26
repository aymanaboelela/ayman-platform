import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';

export const metadata: Metadata = { title: copy.nav.dashboard };

/**
 * Placeholder landing page for a fully authenticated, fully onboarded
 * student. Plan 4 (`app/(app)/dashboard/page.tsx` per
 * `docs/superpowers/plans/README.md`'s route table) replaces this content
 * entirely with continue-watching / enrolled courses / recent scores — this
 * task only needs a real, protected, RENDERING destination for
 * `proxy.ts`'s redirect matrix ("authenticated and onboarded → /onboarding
 * ⇒ redirect to /dashboard") and Plan 2's own definition of done ("reach a
 * dashboard — verified in a browser, not inferred") to be genuinely
 * checkable rather than landing on a 404. `copy.nav.dashboard` already
 * exists (Plan 1) — no new copy namespace is introduced here; `dashboard`
 * as a top-level copy key belongs to Plan 4.
 */
export default function DashboardPage() {
  return (
    <h1 className="text-[length:var(--fs-title-1)] font-semibold">{copy.nav.dashboard}</h1>
  );
}
