import { cache } from 'react';
import { StudentMasterySchema, type StudentMastery } from '@ayman/contracts';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/me/mastery`, shared across one render, and never fatal.
 *
 * ## Why `cache()` and NOT `'use cache'`
 *
 * This file looks like `lib/taxonomy.ts` and must not behave like it. That one
 * is `'use cache'` + `cacheLife('minutes')`, and its own header states the
 * condition that makes it legal: `/api/taxonomy` is unauthenticated and
 * identical for every student, so «a shared cache entry leaks nothing».
 *
 * Mastery is the opposite on both counts, and this function takes NO ARGUMENTS
 * — so a `'use cache'` entry would have nothing to key on and would serve the
 * FIRST student's weakest topics to every student who loaded the dashboard
 * after them. `cache()` is per-request, and `apiGetAuthed` leaves its `fetch`
 * on `no-store`, which is exactly what `lib/dashboard.ts` relies on for the
 * same reason.
 *
 * ## Why it returns `null` instead of throwing
 *
 * The card is an enhancement to a screen that was complete without it, and the
 * dashboard has been taken down once already by exactly this class of failure:
 * an added read on the busiest authenticated path, answered 429 by the
 * throttler, thrown through the API helper into «This page couldn't load» —
 * see the note on `getTaxonomyOrNull()`'s call site in `dashboard/page.tsx`.
 * This read makes the page's sixth parallel API call against a `short` limit
 * of 10 per second (`app.module.ts`), which is headroom, not comfort.
 *
 * The `try` is inside rather than at the call site so no future caller can
 * forget it. A `cache()`-wrapped function throws normally, so either position
 * would work — unlike the `'use cache'` case, where only the inner form
 * catches at all.
 *
 * Server Components / Server Actions only: `apiGetAuthed` reads `cookies()`.
 */
export const getMasteryOrNull = cache(async function getMasteryOrNull(): Promise<StudentMastery | null> {
  try {
    return await apiGetAuthed('/api/me/mastery', StudentMasterySchema);
  } catch {
    return null;
  }
});
