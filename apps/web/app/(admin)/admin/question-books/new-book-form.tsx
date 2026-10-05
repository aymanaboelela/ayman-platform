'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';
import type { ExternalBookCourse } from '@ayman/contracts/quiz/external-books';
import { createBookAction } from './actions';
import { courseGroupLabel } from './groups';

const c = copy.admin.questionBooks;

export function NewBookForm({ courses }: { courses: ExternalBookCourse[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    start(async () => {
      const result = await createBookAction(trimmed, courseId || null);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setTitle('');
      router.refresh();
    });
  };

  return (
    <form
      action={submit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-2 p-3"
    >
      <div className="min-w-0 flex-1">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={c.titlePlaceholder}
          maxLength={200}
        />
      </div>
      <Select
        aria-label={c.newBookCourse}
        value={courseId}
        onChange={(event) => setCourseId(event.target.value)}
        className="w-auto min-w-0 max-w-full sm:max-w-sm"
      >
        <option value="">{c.courseNone}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {courseGroupLabel(course)} — {course.title}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={pending || title.trim().length === 0}>
        <Plus className="size-4" aria-hidden="true" />
        {pending ? c.adding : c.addBook}
      </Button>
      {failed ? <p className="w-full text-[length:var(--fs-text-sm)] text-err">{c.failed}</p> : null}
    </form>
  );
}
