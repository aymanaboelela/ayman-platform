'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Entitlements, FeatureKey } from '@ayman/contracts/admin/entitlements';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * Which entitlement-gated rows the student rail shows.
 *
 * The rail is a static table (`student-nav-items.ts`) rendered by client
 * components deep inside the shell, and the shell's layout is deliberately
 * synchronous — awaiting anything there blocks every route's static shell
 * (see `app/(app)/layout.tsx`). So the stack's entitlements arrive the way
 * the shell's other dynamic reads do, in their own `<Suspense>` slot, and are
 * handed to the rail through this tiny store instead of a context the slot
 * could not wrap the rail in.
 *
 * Until the slot answers (`null`), Ayman's stack shows every row — his rail
 * never flickers, it is byte-for-byte what it was before this store existed —
 * and any other stack shows none of the gated ones. When the owner opens a
 * feature for a teacher from `/admin/platforms`, the redeployed stack reports
 * it here and the row appears — no code change, no rebuild of the table.
 *
 * ⚠️ Type-only import from the entitlements module: it builds Zod schemas,
 * and this file is reachable from the shell's layout, so a value import would
 * put Zod in every route's client bundle (`lib/client-barrel.test.ts`).
 */
let current: Entitlements | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `true` when the row has no feature, or the stack has that feature on. */
export function useStudentFeatureGate(): (feature: FeatureKey | undefined) => boolean {
  const features = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
  return (feature) => feature === undefined || (features === null ? IS_AYMAN : features[feature]);
}

/** Rendered by the layout's entitlements slot; publishes what the API said. */
export function StudentFeaturesSync({ features }: { features: Entitlements }) {
  useEffect(() => {
    current = features;
    for (const listener of listeners) listener();
  }, [features]);
  return null;
}
