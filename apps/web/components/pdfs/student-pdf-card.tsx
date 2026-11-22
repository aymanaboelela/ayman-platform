import Link from 'next/link';
import { BookOpenText, Download } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { pdfSizeLabel, type PdfListItem } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { pdfDownloadPath, studentPdfPath } from '@/lib/pdfs';
import { PdfSheet } from './pdf-sheet';

const c = pdfsCopy;
const s = pdfsCopy.student;

/** Two weeks: long enough to survive a student who opens the app weekly,
 *  short enough that the badge still means something. */
const NEW_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * One file on `/files` — the student shell's twin of `PdfCard`.
 *
 * Not `PdfCard` itself because every link on that one goes to the public
 * `/pdfs/:slug` page, which renders in the marketing chrome: the exact
 * «بتطلعني بره» this route exists to stop. The drawn sheet, the category hue
 * and the tag are shared (`PdfSheet`, `pdfs.css`); the destinations are not.
 *
 * «اقرأ هنا» is the primary button because a student mid-study wants to look,
 * not to fill a phone with files; «حمّل» sits beside it for the one who does.
 */
export function StudentPdfCard({ pdf, now }: { pdf: PdfListItem; now: number }) {
  const reader = studentPdfPath(pdf.slug);
  const fresh = now - new Date(pdf.publishedAt).getTime() < NEW_FOR_MS;
  return (
    <article className="files-card" data-category={pdf.category}>
      <Link href={reader} className="files-card__sheet" tabIndex={-1} aria-hidden="true">
        <PdfSheet title={pdf.title} category={pdf.category} coverKey={pdf.coverKey} />
      </Link>
      <div className="files-card__body">
        <p className="files-card__tags">
          <span className="pdf-tag" data-category={pdf.category}>
            {c.category[pdf.category]}
          </span>
          <span className="pdf-tag pdf-tag--plain">{pdf.year ? c.year[pdf.year] : s.both}</span>
          {fresh ? <span className="files-card__new">{s.newBadge}</span> : null}
        </p>
        <h3 className="files-card__title">
          <Link href={reader}>{pdf.title}</Link>
        </h3>
        <p className="files-card__desc">{pdf.description}</p>
        <p className="files-card__meta">
          {pdf.pageCount ? <span>{formatCopy(c.pages, { n: String(pdf.pageCount) })}</span> : null}
          <span>{pdfSizeLabel(pdf.sizeBytes)}</span>
        </p>
        <div className="files-card__actions">
          <Link href={reader} className="files-btn files-btn--solid">
            <BookOpenText className="size-4" aria-hidden="true" />
            {s.read}
          </Link>
          <a href={pdfDownloadPath(pdf.slug)} className="files-btn files-btn--ghost" download>
            <Download className="size-4" aria-hidden="true" />
            {s.download}
          </a>
        </div>
      </div>
    </article>
  );
}
