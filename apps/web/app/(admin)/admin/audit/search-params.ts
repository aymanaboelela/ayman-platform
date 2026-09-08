import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { AUDIT_ACTIONS } from '@ayman/contracts/admin/audit';

/**
 * Sorting is deliberately absent from this parser set — the API's own
 * `AuditReadService.list` hardcodes `orderBy: { occurredAt: 'desc' }` and
 * takes no sort parameter at all. An append-only chain has exactly one
 * meaningful order; a URL param this screen never sends is safer than one
 * the server would have to reject.
 */
export const auditSearchParams = {
  page: parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  perPage: parseAsInteger.withDefault(50).withOptions({ shallow: false }),
  action: parseAsArrayOf(parseAsStringLiteral(AUDIT_ACTIONS)).withDefault([]).withOptions({ shallow: false }),
  resourceType: parseAsString.withOptions({ shallow: false }),
  actorUserId: parseAsString.withOptions({ shallow: false }),
  outcome: parseAsStringLiteral(['success', 'failure', 'denied'] as const).withOptions({ shallow: false }),
  /**
   * The date range.
   *
   * Complete server-side since the endpoint shipped — `audit-read.dto.ts`
   * validates both and `buildWhere` turns them into `occurredAt gte/lte` — and
   * missing from this parser set entirely, so the page could not send them.
   * «اللي حصل يوم كذا» was built and unreachable.
   *
   * A plain date (`YYYY-MM-DD`) on the wire here, widened to a full-day range
   * at the fetch: the DTO wants an ISO datetime, and asking him for a timestamp
   * to answer "which day" is asking the wrong question.
   */
  from: parseAsString.withOptions({ shallow: false }),
  to: parseAsString.withOptions({ shallow: false }),
};

export const auditCache = createSearchParamsCache(auditSearchParams);
