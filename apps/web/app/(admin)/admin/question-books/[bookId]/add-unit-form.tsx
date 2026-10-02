'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { createUnitAction } from '../actions';

const c = copy.admin.questionBooks;

export function AddUnitForm({ bookId }: { bookId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, start] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    start(async () => {
      const result = await createUnitAction(bookId, trimmed);
      if (result.ok) {
        setName('');
        router.refresh();
      } else {
        toast.error(c.failed);
      }
    });
  };

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-3">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={c.unitPlaceholder}
        maxLength={200}
        className="max-w-xs"
      />
      <Button type="submit" variant="secondary" disabled={pending || name.trim().length === 0}>
        <Plus className="size-4" aria-hidden="true" />
        {c.addUnit}
      </Button>
    </form>
  );
}
