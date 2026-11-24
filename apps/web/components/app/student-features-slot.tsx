import { getEntitlements } from '@/lib/entitlements';
import { getFlags, stackFlag } from '@/lib/flags';
import { StudentFeaturesSync } from './student-features';

/**
 * The server half of `student-features.tsx`: one cached read of this stack's
 * entitlements and flags (`cacheLife('minutes')`, shared with every other reader), sent
 * to the rail. Lives in its own `<Suspense>` so the layout stays synchronous.
 */
export async function StudentFeaturesSlot() {
  // Both reads are `'use cache'` and shared with every other reader; the flags
  // one is tagged, so a switch on `/admin/flags` reaches the rail next request.
  const [features, flags] = await Promise.all([getEntitlements(), getFlags()]);
  return (
    <StudentFeaturesSync
      features={features}
      flags={{
        'arena.enabled': stackFlag(flags, 'arena.enabled'),
        'mistakes.enabled': stackFlag(flags, 'mistakes.enabled'),
      }}
    />
  );
}
