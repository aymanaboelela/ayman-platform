import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import { PDF_CATEGORIES, type PdfListItem } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';
import { StudentPdfCard, freshPdfIds } from '@/components/pdfs/student-pdf-card';
import { getPdfListOrEmpty } from '@/lib/pdfs';
import { IS_AYMAN } from '@/lib/tenant';

import '../../(site)/styles/pdfs.css';
import './files.css';

const c = pdfsCopy;
const s = pdfsCopy.student;

export const metadata: Metadata = { title: c.title };

type YearKey = 'all' | '1' | '2';
const YEARS: ReadonlyArray<{ key: YearKey; label: string }> = [
  { key: 'all', label: c.yearAll },
  { key: '1', label: c.year[1] },
  { key: '2', label: c.year[2] },
];

/**
 * «ملفات PDF» inside the student shell — the files published from
 * `/admin/pdfs`, without leaving the app.
 *
 * ## Why a second route next to the public `/pdfs`
 *
 * The same reason `/store` sits next to `/books` and `/library` next to
 * `/courses`: `/pdfs` is the indexed page a stranger lands on from Google or a
 * YouTube description, and it renders in the marketing chrome. Pressing a rail
 * row and losing the rail is the complaint every one of those twins was built
 * for. The list is the SAME cached loader (`getPdfListOrEmpty`), so publishing
 * a file shows it in both places at once.
 *
 * ## The year filter is links
 *
 * `?year=` rather than client state — the page stays a server component with
 * no JavaScript of its own, and a file that belongs to both years shows under
 * either, because it is for both.
 *
 * Ayman's stack only — 404 elsewhere (`IS_AYMAN`, the same gate as the API).
 */
export default async function StudentFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  if (!IS_AYMAN) notFound();
  const [{ year: rawYear }, { pdfs }] = await Promise.all([searchParams, getPdfListOrEmpty()]);
  const year: YearKey = rawYear === '1' || rawYear === '2' ? rawYear : 'all';
  const fresh = freshPdfIds(pdfs);

  const shown = year === 'all' ? pdfs : pdfs.filter((pdf) => pdf.year === null || String(pdf.year) === year);
  const groups = PDF_CATEGORIES.map((category) => ({
    category,
    items: shown.filter((pdf) => pdf.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="files-surface mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <header className="files-hero">
        <span className="files-hero__icon" aria-hidden="true">
          <FileText className="size-7" strokeWidth={1.75} />
        </span>
        <div className="files-hero__text">
          <p className="files-hero__eyebrow">{s.eyebrow}</p>
          <h1 className="files-hero__title">{c.title}</h1>
          <p className="files-hero__lead">{s.lead}</p>
        </div>
        {pdfs.length > 0 ? (
          <p className="files-hero__count">
            <span className="files-hero__count-n">{pdfs.length}</span>
            <span>{s.countLabel}</span>
          </p>
        ) : null}
      </header>

      {pdfs.length === 0 ? (
        <p className="files-empty">{s.empty}</p>
      ) : (
        <>
          <div className="files-filters">
            <nav className="files-years" aria-label={s.yearFilter}>
              {YEARS.map((option) => (
                <Link
                  key={option.key}
                  href={option.key === 'all' ? '/files' : `/files?year=${option.key}`}
                  aria-current={option.key === year ? 'page' : undefined}
                  className={option.key === year ? 'files-year files-year--on' : 'files-year'}
                >
                  {option.label}
                </Link>
              ))}
            </nav>
            {groups.length > 1 ? (
              <nav className="pdf-chips files-chips" aria-label={c.title}>
                {groups.map((group) => (
                  <a key={group.category} href={`#${group.category}`} className="pdf-chip" data-category={group.category}>
                    {c.categoryPlural[group.category]}
                    <span className="pdf-chip__n">{group.items.length}</span>
                  </a>
                ))}
              </nav>
            ) : null}
          </div>

          {groups.length === 0 ? (
            <p className="files-empty">{s.emptyYear}</p>
          ) : (
            groups.map((group) => (
              <FilesGroup
                key={group.category}
                id={group.category}
                title={c.categoryPlural[group.category]}
                items={group.items}
                fresh={fresh}
              />
            ))
          )}
        </>
      )}
    </main>
  );
}

function FilesGroup({
  id,
  title,
  items,
  fresh,
}: {
  id: string;
  title: string;
  items: PdfListItem[];
  fresh: Set<string>;
}) {
  return (
    <section id={id} className="files-group" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="pdf-group__title" data-category={id}>
        {title}
        <span className="pdf-group__n">{items.length}</span>
      </h2>
      <div className="files-grid">
        {items.map((pdf) => (
          <StudentPdfCard key={pdf.id} pdf={pdf} fresh={fresh.has(pdf.id)} />
        ))}
      </div>
    </section>
  );
}
