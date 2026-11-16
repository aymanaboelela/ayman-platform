import { Suspense } from 'react';
import { getBrandAsset } from '@/lib/brand-assets';
import { uploadedAsset } from '@/lib/brand-image';
import { flagEnabled } from '@/lib/flags';
import { getBranding } from '@/lib/settings';
import { GuideLauncher } from './guide-launcher';
import type { GuideSurface } from './guide-gate';

/**
 * «مرشد الاشتراك» — what the three group layouts mount.
 *
 * Mounted per ROUTE GROUP (`(site)`, `(app)`, `(auth)`), never at the root and
 * never in `(admin)`, `(guardian)` or `(center)` — the same boundary
 * `AssistantSlot` keeps and for the same reason: the root also renders the
 * not-found tree, and the staff surfaces have nobody to guide.
 *
 * ## Why a slot with its own Suspense
 *
 * The switch is a server read (`guide.firstVisit`, a cached flag) and so is
 * the teacher's mark. Awaiting either in a layout would make the shell wait on
 * them; in here the layout stays synchronous and the launcher arrives with the
 * stream. Both reads are `'use cache'` and shared with other consumers, so
 * this adds a reader to two cache entries, not a request to every page.
 *
 * ## Off means absent
 *
 * On a stack with the flag off this returns `null` BEFORE the client
 * component: no launcher in the tree, no client reference in the payload, no
 * listener. The guide is not hidden there — it is not shipped to the page.
 *
 * ## The face is the STACK's, resolved here
 *
 * The teacher's own uploaded mark when there is one; otherwise
 * `getBrandAsset('mark')`, which hands the original instructor's photograph to
 * his stack and `undefined` to every other (`aymanOnly`). A stack with no mark
 * gets `null` and the guide draws a monogram — never somebody else's face.
 */
export function GuideSlot({ surface }: { surface: GuideSurface }) {
  return (
    <Suspense fallback={null}>
      <GuideGate surface={surface} />
    </Suspense>
  );
}

async function GuideGate({ surface }: { surface: GuideSurface }) {
  if (!(await flagEnabled('guide.firstVisit'))) return null;

  const branding = await getBranding();
  const face = branding.markKey ? uploadedAsset(branding.markKey, 'mark') : (getBrandAsset('mark') ?? null);

  return (
    <GuideLauncher
      surface={surface}
      face={face ? { src: face.src, width: face.width, height: face.height } : null}
    />
  );
}
