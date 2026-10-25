import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatCopy } from '@ayman/contracts/format';
import { PDF_CATEGORIES, type PdfListItem } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { JsonLd } from '@/components/seo/json-ld';
import { PdfCard } from '@/components/pdfs/pdf-card';
import { getPdfListOrEmpty } from '@/lib/pdfs';
import { breadcrumbJsonLd, pdfListJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';

const c = pdfsCopy;

export async function generateMetadata(): Promise<Metadata> {
  if (!IS_AYMAN) return { robots: { index: false, follow: false } };
  return buildMetadata({ title: c.title, description: c.metaDescription, path: '/pdfs' });
}

/**
 * «ملفات PDF» — every published file, grouped by kind.
 *
 * Grouped server-side under anchored headings rather than filtered by a
 * client widget: the whole list is in the HTML a crawler reads, each group is
 * an `<h2>` that names what is in it («ملخصات», «امتحانات»), and the chips at
 * the top are plain `#` links that work with no JavaScript.
 *
 * Ayman's stack only — 404 elsewhere (`IS_AYMAN`, same gate as the API).
 */
export default async function PdfsPage() {
  if (!IS_AYMAN) notFound();
  const { pdfs } = await getPdfListOrEmpty();

  const groups = PDF_CATEGORIES.map((category) => ({
    category,
    items: pdfs.filter((pdf) => pdf.category === category),
  })).filter((group) => group.items.length > 0);
  const totalDownloads = pdfs.reduce((sum, pdf) => sum + pdf.downloads, 0);

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: c.title, path: '/pdfs' }])} />
      {pdfs.length > 0 ? <JsonLd data={pdfListJsonLd(pdfs)} /> : null}

      <header className="page-head pdf-hero">
        <div className="site-shell">
          <p className="pdf-hero__eyebrow">{c.eyebrow}</p>
          <h1 className="page-title">{c.title}</h1>
          <p className="site-lead">{c.lead}</p>
          {pdfs.length > 0 ? (
            <p className="pdf-hero__stats">
              <span>
                {formatCopy(c.fileCount, { n: String(pdfs.length) })}
              </span>
              {totalDownloads > 0 ? (
                <span>{formatCopy(c.downloads, { n: totalDownloads.toLocaleString('en') })}</span>
              ) : null}
            </p>
          ) : null}
          {groups.length > 1 ? (
            <nav className="pdf-chips" aria-label={c.title}>
              {groups.map((group) => (
                <a key={group.category} href={`#${group.category}`} className="pdf-chip" data-category={group.category}>
                  {c.categoryPlural[group.category]}
                  <span className="pdf-chip__n">{group.items.length}</span>
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <section className="site-section pdf-section">
        <div className="site-shell">
          {pdfs.length === 0 ? (
            <p className="page-empty">{c.empty}</p>
          ) : (
            groups.map((group) => <PdfGroup key={group.category} id={group.category} title={c.categoryPlural[group.category]} items={group.items} />)
          )}
        </div>
      </section>
    </main>
  );
}

function PdfGroup({ id, title, items }: { id: string; title: string; items: PdfListItem[] }) {
  return (
    <section id={id} className="pdf-group" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="pdf-group__title" data-category={id}>
        {title}
        <span className="pdf-group__n">{items.length}</span>
      </h2>
      <div className="pdf-grid">
        {items.map((pdf) => (
          <PdfCard key={pdf.id} pdf={pdf} />
        ))}
      </div>
    </section>
  );
}
