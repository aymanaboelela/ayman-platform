'use client';

import { useCallback, useEffect, useState } from 'react';
import { CentersListSchema, type CenterView } from '@ayman/contracts/centers';
import { apiGet } from '@/lib/api';

/**
 * The centres a student can book, read in the browser.
 *
 * `null` until the list arrives, and it STAYS `null` if the read fails: both
 * forms treat that exactly like a stack with no centre and hide «نوع الحضور»,
 * so a slow or broken `/api/centers` costs a question, never the sign-up.
 *
 * `initial` is the server's copy on «بياناتك» — the question then renders in
 * the first paint instead of popping in. A `null` there (the server read
 * failed) still gets one try from the browser.
 *
 * `reload()` is for the one moment the list is known to be stale: the save
 * came back «الميعاد ده اتملى», and the card that was picked should now say
 * «فل».
 */
export function useCenters(initial?: CenterView[] | null): {
  centers: CenterView[] | null;
  reload: () => void;
} {
  const [centers, setCenters] = useState<CenterView[] | null>(initial ?? null);
  // Bumped by `reload`; 0 is the first load, skipped when the server sent one.
  const [generation, setGeneration] = useState(0);
  const serverSent = initial != null;

  useEffect(() => {
    if (generation === 0 && serverSent) return;
    let cancelled = false;
    apiGet('/api/centers', CentersListSchema)
      .then((list) => {
        if (!cancelled) setCenters(list.centers);
      })
      .catch(() => {
        /* Keep whatever was showing — see the note on `null` above. */
      });
    return () => {
      cancelled = true;
    };
  }, [generation, serverSent]);

  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  return { centers, reload };
}
