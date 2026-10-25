import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { z } from 'zod';
import { AdminPdfRowSchema, pdfSizeLabel } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { Badge } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { formatArticleDate } from '@/lib/format';
import { IS_AYMAN } from '@/lib/tenant';

const c = pdfsCopy.admin;

export const metadata = { title: c.title };

/**
 * «ملفات PDF» — every file, drafts included, newest edit first. A row per file
 * with its own «تعديل» and the live page one press away; the download count
 * is the number that says whether a link under a video is working.
 */
export default async function AdminPdfsPage() {
  if (!IS_AYMAN) notFound();
  const rows = await adminGet('/api/admin/pdfs', z.array(AdminPdfRowSchema));

  return (
    <div className="mx-auto w-full max-w-[64rem]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
        </div>
        <Link
          href="/admin/pdfs/new"
          className="inline-flex items-center gap-2 rounded-[var(--r-md)] bg-accent px-3 py-2 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] hover:bg-accent-hover"
        >
          <Plus className="size-4" aria-hidden="true" />
          {c.new}
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="panel flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/pdfs/${row.id}`} className="font-medium text-fg hover:text-accent-text">
                    {row.title}
                  </Link>
                  <Badge tone={row.status === 'published' ? 'ok' : 'neutral'}>
                    {row.status === 'published' ? c.published : c.draft}
                  </Badge>
                </div>
                <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                  {pdfsCopy.category[row.category]}
                  {row.year ? ` · ${pdfsCopy.year[row.year]}` : ''} · {pdfSizeLabel(row.sizeBytes)} ·{' '}
                  {formatArticleDate(row.updatedAt)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted tabular-nums">
                <Download className="size-4" aria-hidden="true" />
                {row.downloads.toLocaleString('en')}
              </span>
              <Link
                href={`/admin/pdfs/${row.id}`}
                className="rounded-[var(--r-md)] border border-line bg-surface-2 px-3 py-1.5 text-[length:var(--fs-text-sm)] text-fg hover:border-line-strong"
              >
                {c.edit}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
