import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { IS_AYMAN } from '@/lib/tenant';
import { PdfForm } from '../pdf-form';

export const metadata = { title: pdfsCopy.admin.new };

export default function NewPdfPage() {
  if (!IS_AYMAN) notFound();
  return (
    <div className="mx-auto w-full max-w-[52rem]">
      <Link href="/admin/pdfs" className="mb-4 inline-block text-fg-muted hover:text-fg">
        {pdfsCopy.admin.title}
      </Link>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold text-fg">{pdfsCopy.admin.new}</h1>
      <PdfForm pdf={null} siteUrl={null} />
    </div>
  );
}
