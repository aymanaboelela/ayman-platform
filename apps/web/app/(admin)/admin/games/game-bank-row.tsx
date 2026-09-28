'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gamepad2, ListChecks, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { GameBanks } from '@ayman/contracts/quiz/game';
import { Button } from '@ayman/ui/components/button';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';
import { ensureGameBankAction } from './actions';

const c = copy.admin.games;

/**
 * صف كورس: عدد أسئلته، و«لصق أسئلة» (نفس ديالوج بنك الأسئلة، على تصنيف
 * الكورس بس)، و«عرض وتعديل» في البنك مفلتر على التصنيف.
 *
 * التصنيف بيتعمل أول دوسة («تجهيز أسئلة الكورس») مش مع فتح الصفحة: GET
 * مايكتبش في الداتابيز، وكورس محدش ضاف له أسئلة مالوش لازمة يبقى له تصنيف فاضي.
 */
export function GameBankRow({ row }: { row: GameBanks['rows'][number] }) {
  const router = useRouter();
  const [category, setCategory] = useState(
    row.categoryId ? { id: row.categoryId, name: `ألعاب — ${row.courseTitle}` } : null,
  );
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const prepare = () =>
    start(async () => {
      const result = await ensureGameBankAction(row.courseId);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setCategory({ id: result.categoryId, name: result.categoryName });
    });

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--viz-3)_18%,transparent)] text-[color:var(--viz-3)]">
        <Gamepad2 className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg [overflow-wrap:anywhere]">{row.courseTitle}</p>
        <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          {row.ready > 0 ? formatCopy(c.ready, { n: row.ready }) : c.none}
        </p>
        {failed ? <p className="mt-1 text-[length:var(--fs-text-sm)] text-err">{c.failed}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {category ? (
          <>
            <BulkImportDialog categories={[category]} onCommitted={() => router.refresh()} />
            <Link
              href={`/admin/questions?category=${encodeURIComponent(category.id)}`}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-line bg-surface-1 px-4 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors hover:bg-surface-3"
            >
              <ListChecks className="size-4" aria-hidden="true" />
              {c.view}
            </Link>
          </>
        ) : (
          <Button onClick={prepare} disabled={pending}>
            <Sparkles className="size-4" aria-hidden="true" />
            {pending ? c.preparing : c.prepare}
          </Button>
        )}
      </div>
    </li>
  );
}
