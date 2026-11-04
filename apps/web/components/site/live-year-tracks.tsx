import type { TrackPosters } from '@/components/site/track-card';
import { YearTracks } from '@/components/site/year-tracks';
import { getStackGrades } from '@/lib/stack-grades';

/**
 * `<YearTracks>` with the stack's LIVE grades — its admin's «الصفوف» — read
 * on the server and handed to the client component.
 *
 * A wrapper rather than a fetch in the classic page: `renderBlock` is not
 * async, and the page's own return statement is pinned byte for byte by
 * `landing-preset.test.ts`. With no grades saved and no `TENANT_GRADES` — his
 * stack today — `grades` is `[]` and this renders exactly the element the
 * block always rendered.
 */
export async function LiveYearTracks({ posters }: { posters?: TrackPosters }) {
  return <YearTracks posters={posters} grades={await getStackGrades()} />;
}
