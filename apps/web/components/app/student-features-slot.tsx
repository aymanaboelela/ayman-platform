import { getEntitlements } from '@/lib/entitlements';
import { StudentFeaturesSync } from './student-features';

/**
 * The server half of `student-features.tsx`: one cached read of this stack's
 * entitlements (`cacheLife('minutes')`, shared with every other reader), sent
 * to the rail. Lives in its own `<Suspense>` so the layout stays synchronous.
 */
export async function StudentFeaturesSlot() {
  return <StudentFeaturesSync features={await getEntitlements()} />;
}
