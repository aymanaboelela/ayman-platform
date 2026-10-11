'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FilePlus2, ListChecks } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { BulkImportDialog } from '@/components/admin/quiz/bulk-import-dialog';

const c = copy.admin.questionBooks;

export const ROW_LINK =
  'inline-flex h-9 items-center gap-1.5 rounded-sm border border-line bg-surface-1 px-3 text-[length:var(--fs-text-xs)] font-medium text-fg transition-colors hover:bg-surface-3';

/** البنك موجود دايمًا هنا (التصنيف بيتعمل مع الكتاب/الوحدة/الدرس نفسه، مش
 *  بعدها) — عكس «أسئلة الألعاب» اللي التصنيف فيها بيتعمل أول دوسة. */
export function CategoryActions({ categoryId, name, ready }: { categoryId: string; name: string; ready: number }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BulkImportDialog categories={[{ id: categoryId, name }]} onCommitted={() => router.refresh()} />
      <Link href={`/admin/questions/new?category=${encodeURIComponent(categoryId)}`} className={ROW_LINK}>
        <FilePlus2 className="size-3.5" aria-hidden="true" />
        {c.newQuestion}
      </Link>
      {ready > 0 ? (
        <Link href={`/admin/questions?category=${encodeURIComponent(categoryId)}`} className={ROW_LINK}>
          <ListChecks className="size-3.5" aria-hidden="true" />
          {c.view}
        </Link>
      ) : null}
    </div>
  );
}
