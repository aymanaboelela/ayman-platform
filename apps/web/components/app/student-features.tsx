'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Entitlements, FeatureKey } from '@ayman/contracts/admin/entitlements';
import type { FlagKey } from '@ayman/contracts/admin/flags';
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
let current: { features: Entitlements; flags: StudentNavFlags } | null = null;
const listeners = new Set<() => void>();

/**
 * The flags a rail row can wait on — the student surfaces switched from
 * `/admin/flags` rather than `/admin/platforms` («ساحة التحدي», «دفتر
 * غلطاتي»). Both rows used to be `aymanOnly(true)` in the table, because the
 * rail could not read a flag: a teacher who switched the arena on had a
 * working `/arena` that no student could find. Now the slot sends the stack's
 * answer for each, worked out by `stackFlag` on the server.
 */
export type StudentNavFlag = Extract<FlagKey, 'arena.enabled' | 'mistakes.enabled'>;
export type StudentNavFlags = Record<StudentNavFlag, boolean>;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `true` when the row needs nothing, or the stack has what it needs on.
 *
 * Until the slot answers, Ayman's stack shows every row and any other stack
 * none of the gated ones — the same rule for a flag as for a feature, and the
 * reason his rail does not flicker.
 */
export function useStudentFeatureGate(): (item: {
  feature?: FeatureKey;
  flag?: StudentNavFlag;
}) => boolean {
  const state = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
  return ({ feature, flag }) => {
    if (state === null) return IS_AYMAN || (feature === undefined && flag === undefined);
    return (feature === undefined || state.features[feature]) && (flag === undefined || state.flags[flag]);
  };
}

/** Rendered by the layout's entitlements slot; publishes what the API said. */
export function StudentFeaturesSync({
  features,
  flags,
}: {
  features: Entitlements;
  flags: StudentNavFlags;
}) {
  useEffect(() => {
    current = { features, flags };
    for (const listener of listeners) listener();
  }, [features, flags]);
  return null;
}
