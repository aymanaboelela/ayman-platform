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
};

export const auditCache = createSearchParamsCache(auditSearchParams);
