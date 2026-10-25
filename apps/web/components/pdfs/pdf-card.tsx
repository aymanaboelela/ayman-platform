import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { pdfSizeLabel, type PdfListItem } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { pdfDownloadPath, pdfPagePath } from '@/lib/pdfs';
import { PdfSheet } from './pdf-sheet';

const c = pdfsCopy;

/**
 * One file on `/pdfs` and in a page's «ملفات كمان». Two buttons, not one big
 * link: «حمّل» is what most people came for and must not cost a page load,
 * and «التفاصيل» is the page Google ranks. The sheet and the title link to
 * the page too, so the biggest targets go where the description is.
 */
export function PdfCard({ pdf }: { pdf: PdfListItem }) {
  const page = pdfPagePath(pdf.slug);
  return (
    <article className="pdf-card" data-category={pdf.category}>
      <Link href={page} className="pdf-card__sheet" tabIndex={-1} aria-hidden="true">
        <PdfSheet title={pdf.title} category={pdf.category} coverKey={pdf.coverKey} />
      </Link>
      <div className="pdf-card__body">
        <p className="pdf-card__tags">
          <span className="pdf-tag" data-category={pdf.category}>
            {c.category[pdf.category]}
          </span>
          {pdf.year ? <span className="pdf-tag pdf-tag--plain">{c.year[pdf.year]}</span> : null}
        </p>
        <h3 className="pdf-card__title">
          <Link href={page}>{pdf.title}</Link>
        </h3>
        <p className="pdf-card__desc">{pdf.description}</p>
        <p className="pdf-card__meta">
          {pdf.pageCount ? <span>{formatCopy(c.pages, { n: String(pdf.pageCount) })}</span> : null}
          <span>{pdfSizeLabel(pdf.sizeBytes)}</span>
          {pdf.downloads > 0 ? (
            <span>{formatCopy(c.downloads, { n: pdf.downloads.toLocaleString('en') })}</span>
          ) : null}
        </p>
        <div className="pdf-card__actions">
          <a href={pdfDownloadPath(pdf.slug)} className="site-btn site-btn--solid pdf-card__btn" download>
            <Download className="size-4" aria-hidden="true" />
            {c.download}
          </a>
          <Link href={page} className="site-btn site-btn--outline pdf-card__btn">
            <FileText className="size-4" aria-hidden="true" />
            {c.about}
          </Link>
        </div>
      </div>
    </article>
  );
}
