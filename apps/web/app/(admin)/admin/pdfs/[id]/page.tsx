import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPdfDetailSchema } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { Badge } from '@ayman/ui';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { SITE_URL } from '@/lib/seo/jsonld';
import { IS_AYMAN } from '@/lib/tenant';
import { PdfForm } from '../pdf-form';

export const metadata = { title: pdfsCopy.admin.edit };

export default async function EditPdfPage({ params }: { params: Promise<{ id: string }> }) {
  if (!IS_AYMAN) notFound();
  const { id } = await params;
  const pdf = await adminGetOrNotFound(`/api/admin/pdfs/${encodeURIComponent(id)}`, AdminPdfDetailSchema);
  const isPublished = pdf.status === 'published';

  return (
    <div className="mx-auto w-full max-w-[52rem]">
      <Link href="/admin/pdfs" className="mb-4 inline-block text-fg-muted hover:text-fg">
        {pdfsCopy.admin.title}
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{pdf.title}</h1>
        <Badge tone={isPublished ? 'ok' : 'neutral'}>
          {isPublished ? pdfsCopy.admin.published : pdfsCopy.admin.draft}
        </Badge>
      </div>
      <PdfForm pdf={pdf} siteUrl={SITE_URL} />
    </div>
  );
}
