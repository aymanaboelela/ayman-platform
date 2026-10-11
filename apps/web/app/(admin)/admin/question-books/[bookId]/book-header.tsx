'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Check, Pencil, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { updateBookAction } from '../actions';

const c = copy.admin.questionBooks;

export function BookHeader({ bookId, title, archived }: { bookId: string; title: string; archived: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [pending, start] = useTransition();

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === title) {
      setEditing(false);
      setValue(title);
      return;
    }
    start(async () => {
      const result = await updateBookAction(bookId, { title: trimmed });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  };

  const toggleArchive = () =>
    start(async () => {
      await updateBookAction(bookId, { archived: !archived });
      router.refresh();
    });

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={200} autoFocus />
        <Button type="button" variant="secondary" onClick={save} disabled={pending}>
          <Check className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setValue(title);
            setEditing(false);
          }}
          disabled={pending}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg [overflow-wrap:anywhere]">
        {title}
        {archived ? (
          <span className="ms-2 rounded-full bg-surface-3 px-2 py-0.5 align-middle text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.archived}
          </span>
        ) : null}
      </h1>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex size-8 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-3 hover:text-fg"
        aria-label={c.rename}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={toggleArchive}
        disabled={pending}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line px-2.5 text-[length:var(--fs-text-xs)] text-fg-muted hover:bg-surface-3 disabled:opacity-60"
      >
        {archived ? (
          <ArchiveRestore className="size-3.5" aria-hidden="true" />
        ) : (
          <Archive className="size-3.5" aria-hidden="true" />
        )}
        {archived ? c.restore : c.archive}
      </button>
    </div>
  );
}
