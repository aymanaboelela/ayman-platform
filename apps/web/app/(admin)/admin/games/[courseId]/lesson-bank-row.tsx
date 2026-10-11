'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, FilePlus2, ListChecks, PlayCircle, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { GameBankLesson } from '@ayman/contracts/quiz/game';
import { Button } from '@ayman/ui/components/button';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';
import { ensureGameBankAction, ensureLessonBankAction } from '../actions';
import { ROW_LINK } from '../game-bank-row';

const c = copy.admin.games;

/**
 * صف بنك واحد — درس، أو «أسئلة عامة للكورس» (`lesson` فاضي).
 *
 * الأسئلة نفسها بأدوات البنك: «لصق أسئلة» (نفس ديالوج البنك على التصنيف ده
 * بس)، «سؤال جديد» (فورم البنك مفتوح على التصنيف ده)، و«عرض وتعديل» (البنك
 * مفلتر عليه). مفيش محرّر أسئلة تاني هنا عن قصد.
 *
 * التصنيف بيتعمل أول دوسة، مش مع فتح الصفحة — نفس سبب `GameBankRow`.
 */
export function BankRow({
  courseId,
  lesson,
  general,
}: {
  courseId: string;
  lesson?: GameBankLesson;
  general?: { categoryId: string | null; categoryName: string | null; ready: number };
}) {
  const router = useRouter();
  const initial = lesson
    ? lesson.categoryId
      ? { id: lesson.categoryId, name: lesson.categoryName ?? lesson.title }
      : null
    : general?.categoryId
      ? { id: general.categoryId, name: general.categoryName ?? '' }
      : null;
  const [category, setCategory] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const ready = lesson ? lesson.ready : (general?.ready ?? 0);

  const prepare = () =>
    start(async () => {
      const result = lesson ? await ensureLessonBankAction(courseId, lesson.id) : await ensureGameBankAction(courseId);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setCategory({ id: result.categoryId, name: result.categoryName });
    });

  return (
    <li className="flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={
            lesson?.kind === 'quiz'
              ? 'grid size-9 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--viz-4)_18%,transparent)] text-[color:var(--viz-4)]'
              : 'grid size-9 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--viz-5)_18%,transparent)] text-[color:var(--viz-5)]'
          }
        >
          {lesson?.kind === 'quiz' ? (
            <ClipboardCheck className="size-4" aria-hidden="true" />
          ) : (
            <PlayCircle className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-fg [overflow-wrap:anywhere]">{lesson ? lesson.title : c.generalTitle}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[length:var(--fs-text-xs)]">
            {lesson ? (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--viz-5)_16%,transparent)] px-2 py-0.5 text-fg">
                {formatCopy(c.quizCount, { n: lesson.quizQuestions })}
              </span>
            ) : null}
            <span
              className={
                ready > 0
                  ? 'rounded-full bg-[color-mix(in_oklab,var(--viz-6)_18%,transparent)] px-2 py-0.5 text-fg'
                  : 'rounded-full bg-surface-3 px-2 py-0.5 text-fg-muted'
              }
            >
              {ready > 0 ? formatCopy(c.bankCount, { n: ready }) : c.noBank}
            </span>
          </div>
          {failed ? <p className="mt-1 text-[length:var(--fs-text-sm)] text-err">{c.failed}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {category ? (
          <>
            <BulkImportDialog
              categories={[category]}
              onCommitted={() => router.refresh()}
              {...(lesson ? { lessonId: lesson.id } : {})}
            />
            <Link href={`/admin/questions/new?category=${encodeURIComponent(category.id)}`} className={ROW_LINK}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              {c.newQuestion}
            </Link>
            {ready > 0 ? (
              <Link href={`/admin/questions?category=${encodeURIComponent(category.id)}`} className={ROW_LINK}>
                <ListChecks className="size-4" aria-hidden="true" />
                {c.view}
              </Link>
            ) : null}
          </>
        ) : (
          <Button variant="secondary" onClick={prepare} disabled={pending}>
            <Sparkles className="size-4" aria-hidden="true" />
            {pending ? c.preparing : lesson ? c.prepareLesson : c.prepare}
          </Button>
        )}
      </div>
    </li>
  );
}
