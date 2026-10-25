import { Download } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { pdfSizeLabel, type PdfCard } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { pdfDownloadPath, pdfPagePath } from '@/lib/pdfs';
import { PdfSheet } from './pdf-sheet';

const c = pdfsCopy;

/**
 * «الملف ده معاك PDF» — the download card inside an article that links one.
 * The download is direct; the title goes to the file's own page.
 */
export function ArticlePdfCard({ pdf }: { pdf: PdfCard }) {
  return (
    <aside className="pdf-inline" data-category={pdf.category}>
      <div className="pdf-inline__sheet">
        <PdfSheet title={pdf.title} category={pdf.category} coverKey={pdf.coverKey} />
      </div>
      <div className="pdf-inline__body">
        <p className="pdf-inline__eyebrow">{c.articleCardTitle}</p>
        <p className="pdf-inline__title">
          <a href={pdfPagePath(pdf.slug)}>{pdf.title}</a>
        </p>
        <p className="pdf-inline__desc">{pdf.description}</p>
        <p className="pdf-card__meta">
          <span>{c.category[pdf.category]}</span>
          {pdf.pageCount ? <span>{formatCopy(c.pages, { n: String(pdf.pageCount) })}</span> : null}
          <span>{pdfSizeLabel(pdf.sizeBytes)}</span>
        </p>
        <a href={pdfDownloadPath(pdf.slug)} className="site-btn site-btn--solid" download>
          <Download className="size-4" aria-hidden="true" />
          {c.articleCardCta}
        </a>
      </div>
    </aside>
  );
}
