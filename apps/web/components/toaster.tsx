'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * The single `<Toaster/>` mount in the product, in `app/(admin)/layout.tsx`.
 * Plan 5's quiz builder and Plan 6's every-save-is-a-toast surfaces both
 * assume exactly one mount in the admin tree — two mounts render every toast
 * twice.
 */
export function Toaster() {
  return <SonnerToaster dir="rtl" position="bottom-center" />;
}
