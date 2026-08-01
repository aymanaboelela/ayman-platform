import type { SearchParams } from 'nuqs/server';
import { listResponse } from '@ayman/contracts/admin/list';
import { AuditEntrySchema } from '@ayman/contracts/admin/audit';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { AuditTable } from './audit-table';
import { auditCache } from './search-params';
import { VerifyBanner } from './verify-banner';

const ResponseSchema = listResponse(AuditEntrySchema);

export const metadata = { title: copy.admin.audit.title };

/** Uncached — the audit trail is exactly the kind of data a stale read would misrepresent. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = auditCache.parse(await searchParams);

  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('perPage', String(query.perPage));
  for (const action of query.action) params.append('action', action);
  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.actorUserId) params.set('actorUserId', query.actorUserId);
  if (query.outcome) params.set('outcome', query.outcome);

  const data = await adminGet(`/api/admin/audit?${params.toString()}`, ResponseSchema);

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.audit.title}
      </h1>
      <p className="mb-4 max-w-[var(--w-prose)] text-fg-muted">{copy.admin.audit.lead}</p>

      <VerifyBanner rowCount={data.rowCount} />
      <AuditTable rows={data.rows} rowCount={data.rowCount} page={query.page} perPage={query.perPage} />
    </>
  );
}
