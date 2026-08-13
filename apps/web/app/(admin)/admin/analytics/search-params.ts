import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { STUDENT_ANALYTICS_SORTS } from '@ayman/contracts/admin/analytics';

/** The windows the API accepts. Kept here as the literal union the URL parses
 *  into, so an unknown `?days=` falls back rather than 400ing the page. */
export const WINDOW_DAYS = [7, 30, 90, 365] as const;

/**
 * ONE definition per screen, imported by the RSC page (`.parse(await
 * searchParams)`) and by the client controls (`useQueryStates(...)`). Two
 * copies drift the moment a filter is added, and the symptom is a control that
 * changes the URL and nothing else — see the students list for the precedent.
 */
export const overviewSearchParams = {
  days: parseAsInteger.withDefault(30).withOptions({ shallow: false }),
  courseId: parseAsString.withDefault('').withOptions({ shallow: false }),
};
export const overviewCache = createSearchParamsCache(overviewSearchParams);

export const lessonsSearchParams = {
  courseId: parseAsString.withDefault('').withOptions({ shallow: false }),
  q: parseAsString.withDefault('').withOptions({ shallow: false, throttleMs: 400 }),
};
export const lessonsCache = createSearchParamsCache(lessonsSearchParams);

export const studentsAnalyticsSearchParams = {
  page: parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  perPage: parseAsInteger.withDefault(25).withOptions({ shallow: false }),
  q: parseAsString.withDefault('').withOptions({ shallow: false, throttleMs: 400 }),
  year: parseAsArrayOf(parseAsInteger).withDefault([]).withOptions({ shallow: false }),
  courseId: parseAsString.withDefault('').withOptions({ shallow: false }),
  sort: parseAsStringLiteral(STUDENT_ANALYTICS_SORTS)
    .withDefault('lastActiveAt')
    .withOptions({ shallow: false }),
  dir: parseAsStringLiteral(['asc', 'desc'] as const)
    .withDefault('desc')
    .withOptions({ shallow: false }),
};
export const studentsAnalyticsCache = createSearchParamsCache(studentsAnalyticsSearchParams);

/** `?days=99` is a URL a human typed. Snap it rather than sending it to an
 *  API that will reject the whole request over it. */
export function safeWindow(days: number): (typeof WINDOW_DAYS)[number] {
  return (WINDOW_DAYS as readonly number[]).includes(days)
    ? (days as (typeof WINDOW_DAYS)[number])
    : 30;
}
