'use client';

import { useEffect } from 'react';
import { apiPostVoid } from '@/lib/api';
import { handOverFirstTouch } from '@/lib/first-touch';

/**
 * One attempt per document. React's development double-invoke and a second
 * mount of the shell would otherwise send the same touch twice — harmless (the
 * API answers «already has one») but a wasted request out of a student's
 * rate-limit budget on the very first page they see.
 */
let attempted = false;

/**
 * Renders nothing. In the signed-in shell, hands the browser's first touch to
 * the API — see `handOverFirstTouch` for when it is then forgotten.
 *
 * Mounted in `(app)`, not beside the capture at the root: this needs a
 * session, and the root also wraps every public page, where it would be a 401
 * per page load for every visitor who ever clicked an ad. `(app)` is where
 * BOTH ways of making an account land — the form and Google each go to
 * `/onboarding` — so one mount covers them with no wiring in either.
 *
 * With nothing stored this is one `localStorage` read and no request, which
 * is every page load of every student after their first.
 */
export function FirstTouchClaim() {
  useEffect(() => {
    if (attempted) return;
    attempted = true;
    try {
      void handOverFirstTouch(
        window.localStorage,
        (body) => apiPostVoid('/api/me/acquisition', body),
        Date.now(),
      ).catch(() => undefined);
    } catch {
      // Storage refused — there is nothing to hand over.
    }
  }, []);

  return null;
}
