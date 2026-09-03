'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { ExpenseForm, type BookOption } from './expense-form';

const c = copy.admin.expenses;

/** «أضف مصروف» — the form behind a dialog, so the list stays the page. */
export function ExpenseDialog({ books }: { books: readonly BookOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">{c.add}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.cancel}>
        <DialogHeader>
          <DialogTitle>{c.formTitle}</DialogTitle>
        </DialogHeader>
        {/* `key` on the open state so a second «أضف» starts from empty fields
            rather than from whatever the last one was left holding — the form
            keeps its own state and would otherwise survive the close. */}
        <ExpenseForm
          key={String(open)}
          books={books}
          onDone={() => {
            setOpen(false);
            // The row lands on a Server Component; `revalidatePath` in the
            // action expires the segment and this is what re-reads it.
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
