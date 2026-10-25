import { z } from 'zod';
import { LearningPathSchema } from '@ayman/contracts';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { StudentExternalBookSummarySchema } from '@ayman/contracts/quiz/external-books';
import { ExternalBooksSection } from '@/components/library/external-books-section';
import { apiGetAuthed } from '@/lib/api-server';

const x = quizExperience.books;

export const metadata = { title: x.pageTitle };

/**
 * «الكتب الخارجية» — every external question book across the student's
 * courses, on one page of its own.
 *
 * The books only ever lived as a section at the foot of each course page in
 * «الكورسات», so a student had to know which course carried a book before
 * they could find it — and the owner, asked where they were, could not find
 * them either. This is the rail's door to the same rows; the book, its
 * practice runner and its URLs are still the per-course ones.
 *
 * `/api/me/path` is the enrolled-course list (it carries every enrolled course,
 * not only the current one), and the per-course endpoint is the one the course
 * page already reads, so nothing here is a new API surface. A course whose read
 * fails drops out quietly rather than taking the page down — same rule as the
 * section on the course page.
 */
export default async function ExternalBooksPage() {
  const path = await apiGetAuthed('/api/me/path', LearningPathSchema);

  const perCourse = await Promise.all(
    path.courses.map(async (course) => ({
      course,
      books: await apiGetAuthed(
        `/api/me/external-books/courses/${course.id}`,
        z.array(StudentExternalBookSummarySchema),
      ).catch(() => []),
    })),
  );
  const withBooks = perCourse.filter((entry) => entry.books.length > 0);

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <header className="study-head">
        <h1 className="study-head__title">{x.pageTitle}</h1>
        <p className="study-head__lead">{x.sectionLead}</p>
      </header>

      {withBooks.length === 0 ? (
        <p className="mt-8 rounded-lg border border-study-line bg-study-tint px-6 py-10 text-center text-fg-muted">
          {x.pageEmpty}
        </p>
      ) : (
        <div className="mt-10">
          {withBooks.map(({ course, books }) => (
            <ExternalBooksSection
              key={course.id}
              books={books}
              courseSlug={course.slug}
              title={course.title}
            />
          ))}
        </div>
      )}
    </main>
  );
}
