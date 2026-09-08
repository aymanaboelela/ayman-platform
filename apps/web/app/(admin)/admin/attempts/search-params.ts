import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { ATTEMPT_SORTS, ATTEMPT_STATES } from '@ayman/contracts/admin/attempts';

/**
 * Plan 5's `AttemptAdminService.listAttempts` supports exactly `quizId`,
 * `userId`, `state`, `q`, `take`/`skip` — no arbitrary sort, no date range.
 * This filter set mirrors that surface exactly; adding a filter here that the
 * API cannot honour would silently do nothing.
 */
export const attemptsSearchParams = {
  page: parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  perPage: parseAsInteger.withDefault(20).withOptions({ shallow: false }),
  q: parseAsString.withDefault('').withOptions({ shallow: false, throttleMs: 400 }),
  state: parseAsStringLiteral(ATTEMPT_STATES).withOptions({ shallow: false }),
  quizId: parseAsString.withOptions({ shallow: false }),
  /** The endpoint honours these four now — see `ATTEMPT_SORTS`. The comment
   *  above still holds: nothing is added here that the API cannot apply. */
  sort: parseAsStringLiteral(ATTEMPT_SORTS).withDefault('newest').withOptions({ shallow: false }),
};

export const attemptsCache = createSearchParamsCache(attemptsSearchParams);
