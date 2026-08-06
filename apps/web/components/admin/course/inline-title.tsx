'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import type { ActionResult } from '@/app/(admin)/admin/courses/actions';

/**
 * A title that becomes its own input.
 *
 * The alternative is a «تعديل الاسم» form per section and per lesson, which on
 * a twelve-section course puts forty single-field forms on one page. Here the
 * title IS the field: pressing it swaps a button for an input of the same size
 * at the same position, so nothing on the page moves.
 *
 * Enter and blur both commit; Escape reverts. Blur committing is deliberate —
 * a title that silently reverted when the admin clicked away would discard
 * work they believed was saved, which is the failure mode this whole change
 * set exists to remove.
 *
 * The minimum is 2 characters because `SectionCreateSchema` and
 * `LessonCreateSchema` both say `min(2)`. Falling back to the old value rather
 * than showing an error keeps a stray Enter on an empty field from becoming a
 * 400 the admin has to read.
 */
export function InlineTitle({
  value,
  label,
  className,
  onSave,
}: {
  value: string;
  label: string;
  className?: string;
  onSave: (next: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === value || next.length < 2) {
      setDraft(value);
      return;
    }
    setPending(true);
    const result = await onSave(next);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
    } else {
      toast.error(result.message);
      setDraft(value);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={cn('inline-edit__button', className)}
        aria-label={label}
        disabled={pending}
        onClick={(event) => {
          // A section header is a <summary>, which toggles on any click inside
          // it. Without this, renaming a section also collapses it.
          event.preventDefault();
          event.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className={cn('inline-edit__input', className)}
      aria-label={label}
      value={draft}
      minLength={2}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          // Inside a <form> this would submit it, and inside a <summary> it
          // would toggle the section.
          event.preventDefault();
          event.stopPropagation();
          void commit();
        }
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
