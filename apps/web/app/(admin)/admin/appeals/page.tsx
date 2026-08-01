import type { SearchParams } from 'nuqs/server';
import { z } from 'zod';
import { AdminAppealRowSchema } from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { AppealsTable } from './appeals-table';
import { appealsCache } from './search-params';

const RowsSchema = z.array(AdminAppealRowSchema);

export const metadata = { title: copy.appeal.queueTitle };

/**
 * Upgraded from Plan 5's plain list to the DataTable + nuqs pattern (Plan 6
 * Task 11). Same endpoint (`GET /api/admin/appeals`), same
 * `AppealsService.resolve` behind the row action — this task builds screens
 * over Plan 5's API, not a second one.
 */
export default async function AdminAppealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = appealsCache.parse(await searchParams);

  const params = new URLSearchParams();
  params.set('status', query.state);
  params.set('take', String(query.perPage + 1));
  params.set('skip', String((query.page - 1) * query.perPage));

  const rows = await apiGetAuthed(`/api/admin/appeals?${params.toString()}`, RowsSchema);
  const hasMore = rows.length > query.perPage;

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.appeal.queueTitle}
      </h1>
      <AppealsTable
        rows={hasMore ? rows.slice(0, query.perPage) : rows}
        hasMore={hasMore}
        page={query.page}
        perPage={query.perPage}
      />
    </>
  );
}
