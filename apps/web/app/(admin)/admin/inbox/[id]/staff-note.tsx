'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, NotebookPen, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { STAFF_NOTE_MAX, type StaffNote } from '@ayman/contracts/assistant/conversation';
import { apiPut } from '@/lib/api';

const c = copy.assistant.inbox;

/**
 * «ملاحظات خاصة» — the sticky note on the student, under the thread header.
 * Per student, not per thread, and never on any student-facing payload.
 * Saving an empty note deletes it.
 */
export function StaffNoteCard({ conversationId, note }: { conversationId: string; note: StaffNote | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? '');
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await apiPut(`/api/admin/conversations/${conversationId}/note`, { body: draft });
        setEditing(false);
        toast.success(c.noteSaved);
        router.refresh();
      } catch {
        toast.error(c.noteFailed);
      }
    });
  }

  if (!editing && !note) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft('');
          setEditing(true);
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/50 hover:text-accent-text"
      >
        <Plus className="size-4" aria-hidden="true" />
        {c.noteAdd}
      </button>
    );
  }

  return (
    <section
      aria-label={c.noteTitle}
      className="mt-2 rounded-xl border border-[color-mix(in_oklch,var(--e-ink),transparent_70%)] bg-[color-mix(in_oklch,var(--e-tint),transparent_80%)] p-3"
    >
      <div className="flex items-center gap-2">
        <NotebookPen className="size-4 text-[color:var(--e-ink)]" aria-hidden="true" />
        <span className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.noteTitle}</span>
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.noteHint}</span>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(note?.body ?? '');
              setEditing(true);
            }}
            className="ms-auto inline-flex items-center gap-1 text-[length:var(--fs-text-xs)] text-accent-text hover:underline"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {c.noteEdit}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={STAFF_NOTE_MAX}
            placeholder={c.notePlaceholder}
            aria-label={c.noteTitle}
            autoFocus
            className="w-full resize-y rounded-lg border border-line bg-surface-1 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg focus:border-accent/60 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
            >
              {c.noteCancel}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-accent-contrast disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {c.noteSave}
            </button>
          </div>
        </div>
      ) : note ? (
        <>
          <p className="mt-1.5 whitespace-pre-wrap text-[length:var(--fs-text-sm)] text-fg">{note.body}</p>
          {note.updatedBy ? (
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {formatCopy(c.noteBy, { name: note.updatedBy })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
