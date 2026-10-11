import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Library } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { ExternalBookDetailSchema } from '@ayman/contracts/quiz/external-books';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { BookHeader } from './book-header';
import { CategoryActions } from './category-actions';
import { AddUnitForm } from './add-unit-form';
import { BookCourse } from './book-course';
import { UnitCard } from './unit-card';

const c = copy.admin.questionBooks;

export const metadata: Metadata = { title: c.title };

/**
 * كتاب واحد: أسئلة على الكتاب كله (مالهاش وحدة ولا درس)، وتحتها كل وحدة
 * وكل درس جواها — كل واحدة تصنيف حقيقي في بنك الأسئلة، وليها نفس أدوات
 * الكتابة اللي البنك العادي بيستخدمها.
 */
export default async function QuestionBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const book = await adminGetOrNotFound(`/api/admin/external-books/${encodeURIComponent(bookId)}`, ExternalBookDetailSchema);

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Link
        href="/admin/question-books"
        className="mb-3 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
        {c.back}
      </Link>

      <BookHeader bookId={book.id} title={book.title} archived={book.archived} />
      <BookCourse bookId={book.id} courseId={book.courseId} courses={book.courses} />

      <section className="mt-6 rounded-lg border border-line bg-surface-2 p-3 sm:p-4">
        <h2 className="flex items-center gap-2 font-semibold text-fg">
          <Library className="size-4 text-[color:var(--viz-2)]" aria-hidden="true" />
          {c.bookGeneral}
        </h2>
        <p className="mb-3 mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.bookGeneralHint}</p>
        <CategoryActions categoryId={book.categoryId} name={book.title} ready={book.ready} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-fg">{c.manage}</h2>
        </div>
        <div className="mb-4">
          <AddUnitForm bookId={book.id} />
        </div>
        {book.units.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">{c.noUnits}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {book.units.map((unit) => (
              <UnitCard key={unit.id} bookId={book.id} unit={unit} linked={book.courseId !== null} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
