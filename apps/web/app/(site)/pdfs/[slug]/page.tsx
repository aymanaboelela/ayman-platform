import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Download } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { pdfSizeLabel } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { mediaUrl } from '@ayman/ui/branding';
import { MarkdownBody } from '@/components/news/markdown-body';
import { CopyLinkButton } from '@/components/pdfs/copy-link-button';
import { PdfCard } from '@/components/pdfs/pdf-card';
import { PdfSheet } from '@/components/pdfs/pdf-sheet';
import { JsonLd } from '@/components/seo/json-ld';
import { formatArticleDate } from '@/lib/format';
import { parseMarkdown } from '@/lib/news/markdown';
import { getPdf, pdfDownloadPath } from '@/lib/pdfs';
import { breadcrumbJsonLd, pdfDocumentJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

const c = pdfsCopy;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pdf = await getPdf(slug);
  if (!pdf) return { title: copy.notFound.site.title, robots: { index: false, follow: false } };

  return buildMetadata({
    // «… PDF» in the title on purpose: it is the word people add to the query
    // when they want the file, and the page has to match it.
    title: `${pdf.title} PDF`,
    description: pdf.description,
    path: `/pdfs/${pdf.slug}`,
    image: pdf.coverKey ? mediaUrl(pdf.coverKey) : null,
  });
}

/**
 * One file's page — the link that goes under the YouTube video, and the page
 * that ranks.
 *
 * Above the fold: what it is, how big, and ONE big «حمّل» that downloads
 * directly (no account). Below: «عن الملف» (the indexed text), the way to the
 * paid courses, and four more files. The only `<h1>` is the title.
 */
export default async function PdfPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pdf = await getPdf(slug);
  if (!pdf) notFound();

  const download = pdfDownloadPath(pdf.slug);
  const blocks = pdf.body ? parseMarkdown(pdf.body) : [];

  return (
    <main>
      <JsonLd
        data={pdfDocumentJsonLd({
          ...pdf,
          categoryLabel: c.category[pdf.category],
          yearLabel: pdf.year ? c.year[pdf.year] : null,
          downloadPath: download,
          image: pdf.coverKey ? mediaUrl(pdf.coverKey) : null,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: c.title, path: '/pdfs' },
          { name: pdf.title, path: `/pdfs/${pdf.slug}` },
        ])}
      />

      <section className="pdf-page" data-category={pdf.category}>
        <div className="site-shell pdf-page__grid">
          <div className="pdf-page__visual">
            <PdfSheet title={pdf.title} category={pdf.category} coverKey={pdf.coverKey} size="hero" />
          </div>

          <div className="pdf-page__info">
            <Link href="/pdfs" className="pdf-page__back">
              <ArrowRight className="size-4" aria-hidden="true" />
              {c.back}
            </Link>
            <p className="pdf-card__tags">
              <span className="pdf-tag" data-category={pdf.category}>
                {c.category[pdf.category]}
              </span>
              {pdf.year ? <span className="pdf-tag pdf-tag--plain">{c.year[pdf.year]}</span> : null}
            </p>
            <h1 className="pdf-page__title">{pdf.title}</h1>
            <p className="pdf-page__desc">{pdf.description}</p>

            <dl className="pdf-facts">
              {pdf.pageCount ? (
                <div>
                  <dt>{c.pagesLabel}</dt>
                  <dd>{pdf.pageCount}</dd>
                </div>
              ) : null}
              <div>
                <dt>{c.size}</dt>
                <dd>{pdfSizeLabel(pdf.sizeBytes)}</dd>
              </div>
              {pdf.downloads > 0 ? (
                <div>
                  <dt>{c.downloadsLabel}</dt>
                  <dd>{pdf.downloads.toLocaleString('en')}</dd>
                </div>
              ) : null}
              <div>
                <dt>{c.updated}</dt>
                <dd>
                  <time dateTime={pdf.updatedAt}>{formatArticleDate(pdf.updatedAt)}</time>
                </dd>
              </div>
            </dl>

            <div className="pdf-page__actions">
              <a href={download} className="site-btn site-btn--solid pdf-page__download" download>
                <Download className="size-5" aria-hidden="true" />
                {c.download}
              </a>
              <CopyLinkButton className="site-btn site-btn--outline" />
            </div>
            <p className="pdf-page__free">{c.downloadFree}</p>
          </div>
        </div>
      </section>

      {blocks.length > 0 ? (
        <section className="site-section site-section--tint">
          <div className="site-shell article pdf-about">
            <h2 className="pdf-group__title" data-category={pdf.category}>
              {c.about}
            </h2>
            <MarkdownBody blocks={blocks} />
          </div>
        </section>
      ) : null}

      <section className="site-section">
        <div className="site-shell">
          <aside className="pdf-cta">
            <div>
              <p className="pdf-cta__title">{c.coursesTitle}</p>
              <p className="pdf-cta__body">{c.coursesBody}</p>
            </div>
            <Link href="/courses" className="site-btn site-btn--solid">
              {c.coursesCta}
            </Link>
          </aside>

          {pdf.related.length > 0 ? (
            <div className="pdf-group">
              <h2 className="pdf-group__title">{c.related}</h2>
              <div className="pdf-grid">
                {pdf.related.map((other) => (
                  <PdfCard key={other.id} pdf={other} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
