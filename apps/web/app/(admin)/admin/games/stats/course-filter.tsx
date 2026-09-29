'use client';

import { useQueryStates } from 'nuqs';
import { BookOpen } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Select } from '@ayman/ui/components/select';
import { gameStatsSearchParams } from './search-params';

const c = copy.admin.games;

/** الكورس — فاضي = كل الكورسات. الرابط هو الحالة، زي الفترة جنبه. */
export function CourseFilter({ courses }: { courses: ReadonlyArray<{ id: string; title: string }> }) {
  const [{ courseId }, setQuery] = useQueryStates(gameStatsSearchParams);
  return (
    <label className="inline-flex min-w-0 items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
      <BookOpen className="size-4 shrink-0" aria-hidden="true" />
      <span className="shrink-0">{c.course}</span>
      <Select
        value={courseId}
        onChange={(event) => void setQuery({ courseId: event.target.value || null })}
        className="min-w-0 max-w-[16rem]"
      >
        <option value="">{c.allCourses}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.title}
          </option>
        ))}
      </Select>
    </label>
  );
}
