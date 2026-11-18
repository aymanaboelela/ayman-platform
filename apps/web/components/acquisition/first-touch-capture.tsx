'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/first-touch';

/**
 * Renders nothing. On a document load whose URL carries `utm_*` or `fbclid`,
 * remembers it as this browser's first touch — see `lib/first-touch.ts`.
 *
 * `window.location`, read once in an effect, and deliberately NOT
 * `useSearchParams()`: that hook would need a `<Suspense>` at the root and
 * would re-run on every soft navigation, and neither is wanted. An ad click
 * loads a document; the URL it loaded with is the whole input.
 */
export function FirstTouchCapture() {
  useEffect(() => {
    try {
      captureFirstTouch(window.localStorage, window.location, Date.now());
    } catch {
      // Storage refused (private mode, blocked site data). The visit goes
      // uncounted; the page must not notice.
    }
  }, []);

  return null;
}
