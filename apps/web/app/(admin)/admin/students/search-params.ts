import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';
import {
  STUDENT_ACCESS_FILTERS,
  STUDENT_STREAM_FILTERS,
  STUDENT_LIST_QUERY_SORT_KEYS,
} from '@ayman/contracts/admin/students';

/**
 * ONE definition, imported by both the RSC page (`.parse(await searchParams)`)
 * and the client controls (`useQueryStates(studentsSearchParams)`). Two
 * copies drift the moment a filter is added, and the symptom is a filter
 * that changes the URL and nothing else.
 */
export const studentsSearchParams = {
  page: parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  perPage: parseAsInteger.withDefault(20).withOptions({ shallow: false }),
  // Free text only: throttled so a fast typist does not fire a request per key.
  q: parseAsString.withDefault('').withOptions({ shallow: false, throttleMs: 400 }),
  governorate: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: false }),
  year: parseAsArrayOf(parseAsInteger).withDefault([]).withOptions({ shallow: false }),
  track: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: false }),
  sort: parseAsStringLiteral(STUDENT_LIST_QUERY_SORT_KEYS)
    .withDefault('createdAt')
    .withOptions({ shallow: false }),
  dir: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc').withOptions({ shallow: false }),
  /** «مين اللي مسجّلهم مجاني؟» — null (the default) means "do not filter on
   *  how they got in", not "paid". See `StudentListQuerySchema.access`. */
  access: parseAsStringLiteral(STUDENT_ACCESS_FILTERS).withOptions({ shallow: false }),
  /** عربي / لغات / مش متسجّل — three values, because `school_stream` is
   *  nullable and a two-value filter would hide those students entirely. */
  stream: parseAsStringLiteral(STUDENT_STREAM_FILTERS).withOptions({ shallow: false }),
};

export const studentsCache = createSearchParamsCache(studentsSearchParams);
export { PAGE_SIZES };
