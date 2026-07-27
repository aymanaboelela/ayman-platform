import type { SearchParams } from 'nuqs/server';
import { z } from 'zod';
import { AdminAttemptRowSchema } from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { AttemptsTable } from './attempts-table';
import { attemptsCache } from './search-params';

const RowsSchema = z.array(AdminAttemptRowSchema);

export const metadata = { title: copy.quizAdmin.attemptsTitle };

/**
 * Not cached — an instructor acting on a row must see the result immediately.
 * Fetches `perPage + 1` rows so the client can tell whether a next page
 * exists without the API returning an exact total (see `attempts-table.tsx`).
 */
export default async function AdminAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = attemptsCache.parse(await searchParams);

  const params = new URLSearchParams();
  params.set('take', String(query.perPage + 1));
  params.set('skip', String((query.page - 1) * query.perPage));
  if (query.q) params.set('q', query.q);
  if (query.state) params.set('state', query.state);
  if (query.quizId) params.set('quizId', query.quizId);

  const rows = await adminGet(`/api/admin/attempts?${params.toString()}`, RowsSchema);
  const hasMore = rows.length > query.perPage;

  return (
    <>
      <h1 className="mb-16 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.quizAdmin.attemptsTitle}
      </h1>
      <AttemptsTable
        rows={hasMore ? rows.slice(0, query.perPage) : rows}
        hasMore={hasMore}
        page={query.page}
        perPage={query.perPage}
      />
    </>
  );
}
