'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { createBookAction } from './actions';

const c = copy.admin.questionBooks;

export function NewBookForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    start(async () => {
      const result = await createBookAction(trimmed);
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
      <Button type="submit" disabled={pending || title.trim().length === 0}>
        <Plus className="size-4" aria-hidden="true" />
        {pending ? c.adding : c.addBook}
      </Button>
      {failed ? <p className="w-full text-[length:var(--fs-text-sm)] text-err">{c.failed}</p> : null}
    </form>
  );
}
