'use client';

import { useTransition, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ChevronLeft, Library } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { ExternalBookRow } from '@ayman/contracts/quiz/external-books';
import { updateBookAction } from './actions';

const c = copy.admin.questionBooks;

const TONES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)'] as const;

export function BookRow({ row, index = 0 }: { row: ExternalBookRow; index?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const tone = TONES[index % TONES.length]!;

  const toggleArchive = () =>
    start(async () => {
      await updateBookAction(row.id, { archived: !row.archived });
      router.refresh();
    });

  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-line p-4"
      style={
        {
          '--tone': tone,
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--tone) 10%, var(--color-surface-2)), var(--color-surface-2) 60%)',
          opacity: row.archived ? 0.6 : 1,
        } as CSSProperties
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--tone)_20%,transparent)] text-[color:var(--tone)]">
          <Library className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg [overflow-wrap:anywhere]">
            {row.title}
            {row.archived ? (
              <span className="ms-2 rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.archived}
              </span>
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[length:var(--fs-text-xs)]">
            <span className="rounded-full bg-[color-mix(in_oklab,var(--viz-2)_16%,transparent)] px-2 py-0.5 text-fg">
              {row.ready > 0 ? formatCopy(c.ready, { n: row.ready }) : c.none}
            </span>
            <span className="rounded-full bg-[color-mix(in_oklab,var(--viz-5)_16%,transparent)] px-2 py-0.5 text-fg">
              {formatCopy(c.unitsCount, { n: row.units })}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/question-books/${encodeURIComponent(row.id)}`}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--n-1)] transition-opacity hover:opacity-90"
        >
          {c.manage}
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={toggleArchive}
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-line bg-surface-1 px-4 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-60"
        >
          {row.archived ? (
            <ArchiveRestore className="size-4" aria-hidden="true" />
          ) : (
            <Archive className="size-4" aria-hidden="true" />
          )}
          {row.archived ? c.restore : c.archive}
        </button>
      </div>
    </li>
  );
}
