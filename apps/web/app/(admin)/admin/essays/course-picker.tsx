'use client';

import { Check } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';

export interface CoursePick {
  id: string;
  title: string;
}

/**
 * «الأسئلة لمين؟» — the courses as toggle chips.
 *
 * Chips and not a multi-`<select>`: there are a handful of courses, the usual
 * choice is two or three of them at once (a year's variants), and what is
 * chosen has to be readable at a glance. Nothing chosen is a real answer —
 * «كل المشتركين» — and the hint under the field says so.
 */
export function CoursePicker({
  courses,
  value,
  onChange,
  label,
  hint,
}: {
  courses: readonly CoursePick[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  hint: string;
}) {
  const chosen = new Set(value);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[length:var(--fs-text-sm)] font-medium text-fg">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {courses.map((course) => {
          const on = chosen.has(course.id);
          return (
            <button
              key={course.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((id) => id !== course.id) : [...value, course.id])}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-start text-[length:var(--fs-text-sm)]',
                'transition-colors duration-[160ms] ease-out',
                on
                  ? 'border-accent bg-accent/15 font-semibold text-fg'
                  : 'border-line bg-surface-3 text-fg-muted hover:border-accent/40 hover:text-fg',
              )}
            >
              {on ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              {course.title}
            </button>
          );
        })}
      </div>
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</p>
    </fieldset>
  );
}
