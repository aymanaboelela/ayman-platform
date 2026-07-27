'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { copy } from '@ayman/contracts';

/**
 * The single `<Toaster/>` mount in the product, in the root `app/layout.tsx`
 * — an ancestor of both the `(app)` and `(admin)` route groups (B5). Two
 * mounts anywhere in the tree render every toast twice.
 *
 * `containerAriaLabel` (M5): sonner defaults the live region's accessible
 * name to the English `"Notifications alt+T"`, which lands in the DOM of
 * every page inside `<html lang="ar">`. The region announces its own
 * inserted content correctly (Arabic, since every caller sources its message
 * from `@ayman/contracts`) — this only fixes the container's own name,
 * reachable via landmark navigation or the hotkey.
 */
export function Toaster() {
  return <SonnerToaster dir="rtl" position="bottom-center" containerAriaLabel={copy.a11y.toastRegionLabel} />;
}
