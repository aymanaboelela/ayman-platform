import { createSearchParamsCache, parseAsInteger, parseAsStringLiteral } from 'nuqs/server';
import { APPEAL_STATES } from '@ayman/contracts/admin/attempts';

/**
 * `AppealsService.listForAdmin`'s filter is `{ status?, take?, skip? }` —
 * no free-text search. Default state is `open`: an appeals queue that opens
 * on "all" is a screen nobody triages (Task 11 Step 6).
 */
export const appealsSearchParams = {
  page: parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  perPage: parseAsInteger.withDefault(20).withOptions({ shallow: false }),
  state: parseAsStringLiteral(APPEAL_STATES).withDefault('open').withOptions({ shallow: false }),
};

export const appealsCache = createSearchParamsCache(appealsSearchParams);
