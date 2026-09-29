'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Gamepad2, ListChecks, Settings2, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { GameBanks } from '@ayman/contracts/quiz/game';
import { Button } from '@ayman/ui/components/button';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';
import { ensureGameBankAction } from './actions';

const c = copy.admin.games;

/** لون لكل كارت بالدور — القايمة ملوّنة، مش صفوف رمادي ورا بعض. */
const TONES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)'] as const;

/** الكلاسات المشتركة لزراير الصف — لينك شكله زي `Button` الثانوي. */
export const ROW_LINK =
  'inline-flex h-10 items-center gap-2 rounded-sm border border-line bg-surface-1 px-4 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors hover:bg-surface-3';

/**
 * كارت كورس: أسئلته العامة (لصق، عرض وتعديل)، وعدد أسئلة دروسه، و«الدروس
 * والإعدادات» لصفحة الكورس.
 *
 * التصنيف العام بيتعمل أول دوسة («تجهيز أسئلة الكورس») مش مع فتح الصفحة: GET
 * مايكتبش في الداتابيز، وكورس محدش ضاف له أسئلة مالوش لازمة يبقى له تصنيف فاضي.
 */
export function GameBankRow({ row, index = 0 }: { row: GameBanks['rows'][number]; index?: number }) {
  const router = useRouter();
  const [category, setCategory] = useState(
    row.categoryId ? { id: row.categoryId, name: `ألعاب — ${row.courseTitle}` } : null,
  );
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const tone = TONES[index % TONES.length]!;

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
    <li
      className="flex flex-col gap-3 rounded-lg border border-line p-4"
      style={
        {
          '--tone': tone,
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--tone) 10%, var(--color-surface-2)), var(--color-surface-2) 60%)',
        } as CSSProperties
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--tone)_20%,transparent)] text-[color:var(--tone)]">
          <Gamepad2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg [overflow-wrap:anywhere]">{row.courseTitle}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[length:var(--fs-text-xs)]">
            <span className="rounded-full bg-[color-mix(in_oklab,var(--viz-2)_16%,transparent)] px-2 py-0.5 text-fg">
              {c.general}: {row.ready > 0 ? formatCopy(c.ready, { n: row.ready }) : c.none}
            </span>
            <span className="rounded-full bg-[color-mix(in_oklab,var(--viz-5)_16%,transparent)] px-2 py-0.5 text-fg">
              {row.lessonBanks > 0 ? formatCopy(c.lessonsReady, { n: row.lessonReady, lessons: row.lessonBanks }) : c.lessonsNone}
            </span>
            {row.customized ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--viz-1)_20%,transparent)] px-2 py-0.5 text-fg">
                <Settings2 className="size-3" aria-hidden="true" />
                {c.customized}
              </span>
            ) : null}
          </div>
          {failed ? <p className="mt-1 text-[length:var(--fs-text-sm)] text-err">{c.failed}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/games/${encodeURIComponent(row.courseId)}`}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--n-1)] transition-opacity hover:opacity-90"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          {c.manage}
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        {category ? (
          <>
            <BulkImportDialog categories={[category]} onCommitted={() => router.refresh()} />
            <Link href={`/admin/questions?category=${encodeURIComponent(category.id)}`} className={ROW_LINK}>
              <ListChecks className="size-4" aria-hidden="true" />
              {c.view}
            </Link>
          </>
        ) : (
          <Button variant="secondary" onClick={prepare} disabled={pending}>
            <Sparkles className="size-4" aria-hidden="true" />
            {pending ? c.preparing : c.prepare}
          </Button>
        )}
      </div>
    </li>
  );
}
