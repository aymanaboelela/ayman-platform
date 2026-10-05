'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Swords } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Select } from '@ayman/ui/components/select';
import { updateBookAction } from '../actions';

const c = copy.admin.questionBooks;

/**
 * «التحديات» — الكورس اللي الكتاب بيغذّيه. الربط نفسه بيتحسب في الـAPI
 * (`book-lesson-links.ts`)، والشاشة بتعرض نتيجته على كل درس تحت.
 */
export function BookCourse({
  bookId,
  courseId,
  courses,
}: {
  bookId: string;
  courseId: string | null;
  courses: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: string) =>
    start(async () => {
      const result = await updateBookAction(bookId, { courseId: next || null });
      if (!result.ok) {
        toast.error(c.courseFailed);
        return;
      }
      router.refresh();
    });

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface-2 p-3 sm:p-4">
      <label htmlFor="book-course" className="flex items-center gap-2 font-semibold text-fg">
        <Swords className="size-4 text-[color:var(--viz-3)]" aria-hidden="true" />
        {c.courseLabel}
      </label>
      <p className="mb-3 mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.courseHint}</p>
      <Select
        id="book-course"
        value={courseId ?? ''}
        disabled={pending}
        onChange={(event) => change(event.target.value)}
        className="max-w-xl"
      >
        <option value="">{c.courseNone}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.title}
          </option>
        ))}
      </Select>
    </section>
  );
}
