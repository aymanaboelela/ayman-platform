'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The instructor's own uploaded mark, made readable from anywhere inside the
 * app — because `<BrandLockup>` renders on five signed-in surfaces and not one
 * of them could have been handed a prop.
 *
 * ## Why a context and not a prop on `<BrandLockup>`
 *
 * The lockup is mounted from `student-rail.tsx`, `student-topbar.tsx` (twice —
 * the mobile sheet and the compact bar), `admin-header.tsx`, `app-sidebar.tsx`
 * and `(auth)/layout.tsx`. The first four are `'use client'`, so they cannot
 * read the settings themselves; and the layout above them, `(app)/layout.tsx`,
 * is deliberately NOT `async` — its own docblock documents at length the
 * `/api/session` round-trip that made every transition into the group wait
 * with the previous page still mounted. So the value cannot be awaited above
 * them and cannot be read below them.
 *
 * The `<Suspense>`-slot pattern those layouts use for `courses`,
 * `notifications` and `accountMenu` does not fit either: a slot is a NODE, and
 * the three mounts want the same mark in three different shapes (with a
 * tagline, without one, portrait-only). Passing three pre-rendered lockups
 * down through `<StudentShell>` would move the shape decision away from the
 * component that owns it.
 *
 * ## Why the ROOT layout is the right place to read it
 *
 * Because it already does. `app/layout.tsx` is `async` and awaits
 * `getBranding()` for the inline branding `<style>` and the `<link rel=icon>`;
 * `getBranding()` is a `'use cache'` loader tagged `settings:branding`, so a
 * second consumer on the same render is free. Nothing new is fetched and no
 * layout changes its async-ness.
 *
 * ## What is NOT in here
 *
 * Only the mark. This is not a general branding context and must not grow
 * into one: every field added here is a field that ships into the client
 * bundle on every route, and the rest of `BrandingRead` is already read by
 * server components that can await it.
 */
const BrandMarkContext = createContext<string | null>(null);

/**
 * `markKey` is a storage key (`<2 hex>/<uuid>.webp`), never an asset id — the
 * two are not interconvertible, and passing the id is the bug that made every
 * favicon an admin ever chose 404 silently. See `BrandingReadSchema`.
 */
export function BrandMarkProvider({
  markKey,
  children,
}: {
  markKey: string | null;
  children: ReactNode;
}) {
  return <BrandMarkContext.Provider value={markKey}>{children}</BrandMarkContext.Provider>;
}

/**
 * `null` wherever the provider is absent — which is a supported state, not a
 * misconfiguration: `null` is exactly what a stack with no uploaded logo
 * reports, and every consumer already renders it (Ayman's registered
 * photograph on his stack, the `</>` monogram anywhere else).
 */
export function useBrandMark(): string | null {
  return useContext(BrandMarkContext);
}
