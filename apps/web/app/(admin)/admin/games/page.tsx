import type { Metadata } from 'next';
import { copy } from '@ayman/contracts/copy/admin';
import { GameBanksSchema } from '@ayman/contracts/quiz/game';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { GameBankRow } from './game-bank-row';
import { GamesTabs } from './games-tabs';

const c = copy.admin.games;

export const metadata: Metadata = { title: c.title };

/**
 * «أسئلة الألعاب» — لكل كورس (صف + شعبة) كارت: أسئلته العامة، وأسئلة دروسه،
 * ولو إعداداته متغيّرة، ولينك «الدروس والإعدادات» لصفحته. الألعاب بتسحب من
 * دول ومن الكويزات اللي الطالب امتحنها.
 */
export default async function AdminGamesPage() {
  const data = await adminGetOrForbidden('/api/admin/game-banks', GameBanksSchema);
  if (data === null) return null;

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      <p className="mb-5 mt-2 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.how}</p>
      <GamesTabs active="questions" />
      {data.rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line p-10 text-center text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.rows.map((row, index) => (
            <GameBankRow key={row.courseId} row={row} index={index} />
          ))}
        </ul>
      )}
    </>
  );
}
