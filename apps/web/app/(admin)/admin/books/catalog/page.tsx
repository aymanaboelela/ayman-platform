import { z } from 'zod';
import { AdminBookRowSchema } from '@ayman/contracts/admin/books';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { BOOK_SHIPPING_CENTS, type BookTerm } from '@ayman/contracts/books';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { BooksTabs } from '../books-tabs';
import { BookFormDialog } from './book-form-dialog';
import { BookRowActions } from './book-row-actions';
import { ShippingFeeForm } from './shipping-fee-form';

const c = copy.admin.books;

export const metadata = { title: c.catalogTitle };

const TERM_LABEL: Record<BookTerm, string> = {
  first: c.termFirst,
  second: c.termSecond,
  full: c.termFull,
};

/**
 * `/admin/books/catalog` — «قسم الكتب», the shelf.
 *
 * Uncached `adminGet`, like every other admin read: whoever just changed a
 * price must see their own write, never a stale row that makes a save look like
 * it failed.
 *
 * ## Not paginated, deliberately
 *
 * A shop with more titles than fit on one screen is a different product, and
 * pagination here would put a page control under a list of twelve. The order
 * column is `sortOrder` then title — the same order `/books` renders — so what
 * an admin sees here is the shelf they are editing.
 */
export default async function AdminBooksCatalogPage() {
  const [books, settings, subjects, courses] = await Promise.all([
    adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
    adminGet('/api/admin/settings', SiteSettingsSchema),
    /* `/admin/taxonomy/subjects`, not the public `/api/taxonomy`: the public
       payload nests subjects inside offerings per system/year/track, so the
       same subject appears many times and its bare id is not on it. This route
       answers with the subject table itself, already sorted by `nameAr`. */
    adminGet(
      '/api/admin/taxonomy/subjects',
      z.array(z.object({ id: z.string(), nameAr: z.string() })),
    ),
    adminGet(
      '/api/admin/courses',
      z.array(z.object({ id: z.string(), title: z.string(), status: z.string() })),
    ),
  ]);

  /* Only published courses are offered for linking. A draft course's book has
     nothing to point at yet, and the pairing is a fact about a live product. */
  const courseOptions = courses
    .filter((course) => course.status === 'published')
    .map((course) => ({ id: course.id, title: course.title }));

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {c.catalogTitle}
      </h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.catalogSubtitle}</p>

      <BooksTabs active="/admin/books/catalog" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        {/* The delivery fee lives HERE and not under a fifth settings tab,
            because it is a price and this is the prices screen. */}
        <ShippingFeeForm shippingCents={settings.store?.shippingCents ?? BOOK_SHIPPING_CENTS} />
        <BookFormDialog book={null} subjects={subjects} courses={courseOptions} />
      </div>

      {books.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.catalogEmpty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.catalogEmptyHint}
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                    {book.titleAr}
                  </span>
                  {/*
                    «معروض» / «مخفي» as a BADGE and not a colour on the row:
                    colour alone is not an accessible signal (WCAG 1.4.1), and
                    this is the most consequential fact in the list — the
                    difference between a book the shop sells and one it does
                    not.
                  */}
                  <span
                    className={
                      book.isActive
                        ? 'rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-ok-text'
                        : 'rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted'
                    }
                  >
                    {book.isActive ? c.catalogActive : c.catalogHidden}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {TERM_LABEL[book.term]}
                  </span>
                  {book.subjectNameAr ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                      {book.subjectNameAr}
                    </span>
                  ) : null}
                  {book.year !== null ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                      {book.year}
                    </span>
                  ) : null}
                </div>

                {book.subtitleAr ? (
                  <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
                    {book.subtitleAr}
                  </p>
                ) : null}

                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                  <span className="mono">{formatEGP(book.priceCents)} ج</span>
                  <span>
                    {c.catalogColumnStock}:{' '}
                    {book.stock === null
                      ? c.catalogStockUncounted
                      : book.stock === 0
                        ? c.catalogStockOut
                        : book.stock}
                  </span>
                  <span>
                    {c.catalogColumnOrdered}:{' '}
                    {formatCopy(c.catalogOrderedCount, { n: book.orderedCount })}
                  </span>
                  {book.courseTitle ? <span>{book.courseTitle}</span> : null}
                  <span className="mono" dir="ltr">
                    /books#{book.slug}
                  </span>
                </p>
              </div>

              {/* A button on every row — «اخفيه» first, «امسح» behind a
                  confirm. See `BookRowActions` for why hiding leads. */}
              <div className="flex shrink-0 items-center gap-2">
                <BookFormDialog
                  book={book}
                  subjects={subjects}
                  courses={courseOptions}
                  trigger={
                    <button
                      type="button"
                      className="rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
                    >
                      {c.editButton}
                    </button>
                  }
                />
                <BookRowActions book={book} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
