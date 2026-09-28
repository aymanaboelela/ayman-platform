import type { Metadata } from 'next';
import { copy } from '@ayman/contracts/copy/admin';
import { GameBanksSchema } from '@ayman/contracts/quiz/game';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { GameBankRow } from './game-bank-row';

const c = copy.admin.games;

export const metadata: Metadata = { title: c.title };

/**
 * «أسئلة الألعاب» — لكل كورس تصنيف في بنك الأسئلة، والألعاب بتسحب منه
 * عشوائي لطلبة الكورس، مع أسئلة الكويزات اللي امتحنوها.
 */
export default async function AdminGamesPage() {
  const data = await adminGetOrForbidden('/api/admin/game-banks', GameBanksSchema);
  if (data === null) return null;

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      <p className="mt-2 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.how}</p>
      {data.rows.length === 0 ? (
        <p className="mt-6 text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {data.rows.map((row) => (
            <GameBankRow key={row.courseId} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}
