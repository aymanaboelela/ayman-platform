import type { Metadata } from 'next';
import { copy } from '@ayman/contracts/copy/admin';
import { ExternalBooksSchema } from '@ayman/contracts/quiz/external-books';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { BookRow } from './book-row';
import { NewBookForm } from './new-book-form';

const c = copy.admin.questionBooks;

export const metadata: Metadata = { title: c.title };

/**
 * «أسئلة كتب خارجية» — كل كتاب: اسمه، وكام وحدة فيه، وكام سؤال جاهز على
 * طول الشجرة (الكتاب نفسه + كل وحداته + كل دروسه). التفاصيل والأسئلة نفسها
 * في صفحة الكتاب (`[bookId]`)، اللي بتفتح على أدوات بنك الأسئلة الموجودة —
 * مفيش محرّر أسئلة تاني هنا.
 */
export default async function QuestionBooksPage() {
  const data = await adminGetOrForbidden('/api/admin/external-books', ExternalBooksSchema);
  if (data === null) return null;

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-5 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      <NewBookForm />
      {data.rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line p-10 text-center text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {data.rows.map((row, index) => (
            <BookRow key={row.id} row={row} index={index} />
          ))}
        </ul>
      )}
    </>
  );
}
