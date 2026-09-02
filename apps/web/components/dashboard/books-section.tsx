import Link from 'next/link';
import { copy } from '@ayman/contracts';
import type { BookCard } from '@ayman/contracts/books';
import { CourseArt } from '@/components/course-art';
import { formatEGP } from '@/lib/price';

const c = copy.dashboard;

/**
 * «الكتب» on the student's home screen.
 *
 * ## Why this is not `<BooksStrip>`
 *
 * That component is the landing page's, and it is built from `.site-*` classes
 * — `site-section`, `site-shell`, `site-h2`, `books-grid`, `book-card`. Every
 * one of them lives in `(site)/styles/*.css`, which is imported by
 * `(site)/layout.tsx` and by nothing else: rendered inside the student shell
 * those class names resolve to nothing at all, and the section would come out
 * as unstyled text. Sharing it would have meant either dragging the marketing
 * stylesheet into the app bundle or writing a component that looks wrong in one
 * of the two places. This is the same split `<LibraryCourseCard>` documents
 * against `<CourseCard>`, for the same reason.
 *
 * ## Why it takes its books as a prop
 *
 * The dashboard already awaits nine things in one `Promise.all`, including the
 * book catalogue (it needs `shippingCents` for the per-course «اطلب الكتاب»
 * button anyway). Fetching again here would add a tenth await on the critical
 * path of the heaviest page in the app to re-read a cache entry the caller is
 * already holding.
 *
 * ## Empty
 *
 * Renders nothing. A student whose shop has no stock this week should see the
 * page they saw last week, not a heading standing over an apology.
 */
export function BooksSection({ books }: { books: readonly BookCard[] }) {
  if (books.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.books}</h2>
        <Link href="/books" className="group-head__count hover:text-accent-text">
          {c.booksSeeAll}
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {books.map((book) => (
          <li key={book.id}>
            {/*
              The whole tile is the link. There is nothing else to press — the
              basket and its stepper live on `/books` — so anything smaller is
              a target a thumb misses.
            */}
            <Link
              href="/books"
              className="panel group block overflow-hidden p-0 transition-colors hover:border-line-strong"
            >
              {/* 3/4, matching the shop's own card: a book is taller than it is
                  wide, and the covers are photographs of one. `CourseArt` crops
                  rather than squashes, so the generated fallback fits too. */}
              <div className="relative aspect-[3/4] bg-surface-3">
                <CourseArt
                  coverKey={book.coverKey}
                  subjectNameAr={book.titleAr}
                  seed={book.slug}
                  compact
                />
              </div>
              <div className="flex flex-col gap-1 p-3">
                <span className="line-clamp-2 text-[length:var(--fs-text-sm)] font-[var(--fw-medium)] text-fg">
                  {book.titleAr}
                </span>
                <span className="text-[length:var(--fs-text-sm)] font-[var(--fw-bold)] text-accent-text">
                  {/* The bare number, exactly as `/books` prints it — two prices
                      for one book, written two ways, is how a reader starts
                      doubting the total. */}
                  {formatEGP(book.priceCents)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
