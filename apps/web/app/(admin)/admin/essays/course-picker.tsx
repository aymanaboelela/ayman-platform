'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@ayman/ui/components/input';
import { cn } from '@ayman/ui/lib/cn';

/** Above this many courses the picker grows a search box. */
const SEARCH_FROM = 8;

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
  searchLabel,
}: {
  courses: readonly CoursePick[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  hint: string;
  searchLabel: string;
}) {
  const [query, setQuery] = useState('');
  const chosen = new Set(value);
  const needle = query.trim();
  // What is already chosen always stays on screen, whatever is typed: a chip
  // that vanished while filtering would be a choice nobody can see or undo.
  const shown = courses.filter((course) => chosen.has(course.id) || needle === '' || course.title.includes(needle));

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[length:var(--fs-text-sm)] font-medium text-fg">{label}</legend>
      {courses.length > SEARCH_FROM ? (
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="mt-1.5"
        />
      ) : null}
      {/* A bounded box: a stack with thirty courses must not push the
          questions — the reason the dialog was opened — off the screen. */}
      <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-surface-2 p-2">
        {shown.map((course) => {
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
