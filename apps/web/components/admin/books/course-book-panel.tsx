'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { BookOpen, ExternalLink, Plus } from 'lucide-react';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { StreamBadge } from '@/components/stream-badge';
import { loadCourseBookAction } from '@/app/(admin)/admin/books/catalog/actions';
import { formatEGP } from '@/lib/price';
import { BookFormDialog, type SubjectOption } from './book-form-dialog';
import { bookPlacementLabels, courseOptionLabel } from './book-payload';

const c = copy.admin.books;

/**
 * «أضيف كتاب من جوه الكورس» — the course editor's book block.
 *
 * ## What this replaced, and why it had to
 *
 * `courses.book_title` + `courses.book_price_cents` were a SECOND
 * representation of a book, written from this very block, with no link to the
 * `books` row the shop sells. Two rows, two prices, one object: that is why the
 * catalogue could quote one number while the course page quoted another, and
 * why nobody could say which one an order had actually charged. The columns are
 * still READ by the API as a documented fallback for courses that predate the
 * catalogue — they are not deleted here — but nothing writes them any more.
 * There is one add-book form now, and this mounts it with the course locked.
 *
 * ## Why it loads its own data
 *
 * The link lives on `books.course_id`, pointing at the course rather than out
 * from it, so `AdminCourseDetail` does not carry it. See
 * `loadCourseBookAction` for why that read happens here instead of on the page.
 */
export function CourseBookPanel({
  courseId,
  courseTitle,
  courseYear,
  forGeneral,
  forLanguages,
}: {
  courseId: string;
  courseTitle: string;
  courseYear: number;
  forGeneral: boolean;
  forLanguages: boolean;
}) {
  const [book, setBook] = useState<AdminBookRow | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await loadCourseBookAction(courseId);
      if (result.ok) {
        setBook(result.book);
        setSubjects(result.subjects);
        setError(null);
      } else {
        setError(result.message);
      }
      setLoaded(true);
    });
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  /* The same sentence the catalogue's own picker would have shown for this
     course, so the locked link and the pickable one read identically. */
  const lockedCourse = {
    id: courseId,
    label: courseOptionLabel({ title: courseTitle, year: courseYear, forGeneral, forLanguages }),
  };

  if (!loaded) {
    return <Skeleton className="h-20 w-full rounded-[var(--r-sm)]" />;
  }

  if (error) {
    return (
      <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
        {error}
      </p>
    );
  }

  if (book === null) {
    /* An empty state with a real, labelled button on it — not a bare line of
       grey text that leaves the admin looking for the place to press. */
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--r-sm)] border border-dashed border-line bg-surface-3 p-4">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.catalogEmptyHint}</p>
        <BookFormDialog
          book={null}
          subjects={subjects}
          courses={[]}
          lockedCourse={lockedCourse}
          onSaved={load}
          trigger={
            <Button type="button" size="sm">
              <Plus size={16} aria-hidden="true" />
              {c.catalogNew}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-sm)] border border-line bg-surface-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen size={16} aria-hidden="true" className="text-accent-text" />
          <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
            {book.titleAr}
          </span>
          <Badge tone={book.isActive ? 'ok' : 'neutral'}>
            {book.isActive ? c.catalogActive : c.catalogHidden}
          </Badge>
          <StreamBadge forGeneral={book.forGeneral} forLanguages={book.forLanguages} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span className="mono">{formatEGP(book.priceCents)} ج</span>
          <span>
            {c.catalogColumnPlacement}: {bookPlacementLabels(book).join(' · ')}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <BookFormDialog
          book={book}
          subjects={subjects}
          courses={[]}
          lockedCourse={lockedCourse}
          onSaved={load}
          trigger={
            <Button type="button" variant="secondary" size="sm">
              {c.editButton}
            </Button>
          }
        />
        {/* The catalogue is where the book is deleted, restocked and reordered.
            A link out beats duplicating three more controls into a course form
            that already runs to six blocks. */}
        <Link
          href="/admin/books/catalog"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {c.catalogTitle}
        </Link>
      </div>
    </div>
  );
}
