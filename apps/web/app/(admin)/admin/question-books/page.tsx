import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { formatCopy } from '@ayman/contracts/format';
import { copy } from '@ayman/contracts/copy/admin';
import { ExternalBooksSchema } from '@ayman/contracts/quiz/external-books';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { BookRow } from './book-row';
import { NewBookForm } from './new-book-form';
import { groupBooks } from './groups';

const c = copy.admin.questionBooks;

export const metadata: Metadata = { title: c.title };

/**
 * «أسئلة كتب خارجية» — كل كتاب: اسمه، وكام وحدة فيه، وكام سؤال جاهز على
 * طول الشجرة (الكتاب نفسه + كل وحداته + كل دروسه). التفاصيل والأسئلة نفسها
 * في صفحة الكتاب (`[bookId]`)، اللي بتفتح على أدوات بنك الأسئلة الموجودة —
 * مفيش محرّر أسئلة تاني هنا.
 *
 * متقسّمة على الصف والشعبة («تانية بكالوريا · عربي») — من الكورس اللي الكتاب
 * بيغذّي تحدياته، مش من حقل على الكتاب نفسه.
 */
export default async function QuestionBooksPage() {
  const data = await adminGetOrForbidden('/api/admin/external-books', ExternalBooksSchema);
  if (data === null) return null;

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-5 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      <NewBookForm courses={data.courses} />
      {data.rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line p-10 text-center text-fg-muted">{c.empty}</p>
      ) : (
        groupBooks(data.rows, data.courses).map((group, groupIndex) => (
          <section key={group.key} className="mt-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-fg">
              <GraduationCap className="size-4 text-[color:var(--viz-1)]" aria-hidden="true" />
              {group.label}
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-normal text-fg-muted">
                {formatCopy(c.booksCount, { n: group.rows.length })}
              </span>
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {group.rows.map((row, index) => (
                <BookRow key={row.id} row={row} index={groupIndex * 2 + index} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
