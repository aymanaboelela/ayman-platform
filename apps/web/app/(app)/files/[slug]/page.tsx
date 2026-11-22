import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Download, ExternalLink } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { pdfSizeLabel } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { PdfSheet } from '@/components/pdfs/pdf-sheet';
import { getPdf, pdfDownloadPath, pdfViewPath, studentPdfPath } from '@/lib/pdfs';
import { IS_AYMAN } from '@/lib/tenant';

import '../../../(site)/styles/pdfs.css';
import '../files.css';

const c = pdfsCopy;
const s = pdfsCopy.student;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const pdf = await getPdf((await params).slug);
  return { title: pdf?.title ?? c.title };
}

/**
 * The reader — one file, framed inside the student shell.
 *
 * The frame loads `GET /api/pdfs/:slug/view`: the download's twin with
 * `inline` instead of `attachment`, and the same sandbox CSP that makes
 * framing a file on our own origin safe (`document-viewer.tsx` has the whole
 * argument, including why there is no `sandbox` attribute on the iframe).
 *
 * Android Chrome does not render a PDF inside an iframe at all, and iOS shows
 * the first page only — so the two buttons above the frame are not extras:
 * on a phone they ARE the reader, and the hint under the frame says so.
 */
export default async function StudentFileReaderPage({ params }: { params: Params }) {
  if (!IS_AYMAN) notFound();
  const pdf = await getPdf((await params).slug);
  if (!pdf) notFound();

  return (
    <main className="files-surface mx-auto w-full max-w-[var(--w-app)] px-6 py-8 md:py-10">
      <Link href="/files" className="files-back">
        <ArrowRight className="size-4" aria-hidden="true" />
        {s.back}
      </Link>

      <header className="files-reader__head" data-category={pdf.category}>
        <div className="files-reader__sheet">
          <PdfSheet title={pdf.title} category={pdf.category} coverKey={pdf.coverKey} />
        </div>
        <div className="files-reader__text">
          <p className="files-card__tags">
            <span className="pdf-tag" data-category={pdf.category}>
              {c.category[pdf.category]}
            </span>
            <span className="pdf-tag pdf-tag--plain">{pdf.year ? c.year[pdf.year] : s.both}</span>
          </p>
          <h1 className="files-reader__title">{pdf.title}</h1>
          <p className="files-reader__desc">{pdf.description}</p>
          <p className="files-card__meta">
            {pdf.pageCount ? <span>{formatCopy(c.pages, { n: String(pdf.pageCount) })}</span> : null}
            <span>{pdfSizeLabel(pdf.sizeBytes)}</span>
          </p>
          <div className="files-card__actions">
            <a href={pdfDownloadPath(pdf.slug)} className="files-btn files-btn--solid" download>
              <Download className="size-4" aria-hidden="true" />
              {c.download}
            </a>
            <a href={pdfViewPath(pdf.slug)} className="files-btn files-btn--ghost" target="_blank" rel="noopener">
              <ExternalLink className="size-4" aria-hidden="true" />
              {s.openTab}
            </a>
          </div>
        </div>
      </header>

      <div className="files-reader__frame-wrap">
        <iframe src={pdfViewPath(pdf.slug)} title={s.frameTitle} className="files-reader__frame" />
      </div>
      <p className="files-reader__hint">{s.frameHint}</p>

      {pdf.related.length > 0 ? (
        <section className="files-related" aria-labelledby="files-related-title">
          <h2 id="files-related-title" className="files-related__title">
            {s.related}
          </h2>
          <ul className="files-related__list">
            {pdf.related.map((other) => (
              <li key={other.id}>
                <Link href={studentPdfPath(other.slug)} className="files-related__item" data-category={other.category}>
                  <span className="files-related__sheet" aria-hidden="true">
                    <PdfSheet title={other.title} category={other.category} coverKey={other.coverKey} />
                  </span>
                  <span className="files-related__name">{other.title}</span>
                  <span className="files-related__kind">{c.category[other.category]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
