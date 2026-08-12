'use client';

import { Toaster as SonnerToaster } from 'sonner';
// The `/copy` SUBPATH, never the root barrel. This component is mounted in
// `app/layout.tsx`, so whatever it imports becomes a client reference on all 65
// route manifests — including `/offline` and `/_not-found`. Through the barrel
// that was 539 KB raw / 128 KB gzip of zod schemas, libphonenumber's 245-country
// calling-code table and every admin string in the product, downloaded and
// parsed on a phone to give one live region its Arabic accessible name.
import { copy } from '@ayman/contracts/copy';

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
