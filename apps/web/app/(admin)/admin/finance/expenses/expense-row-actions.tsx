'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminExpenseRow } from '@ayman/contracts/admin/expenses';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { deleteExpenseAction } from './actions';
import { ExpenseForm, type BookOption } from './expense-form';

const c = copy.admin.expenses;

/** «تعديل» / «حذف» on one ledger row. */
export function ExpenseRowActions({
  row,
  books,
}: {
  row: AdminExpenseRow;
  books: readonly BookOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    // A ledger row is money somebody will look for later, so this asks before
    // it goes — same guard «اتشحن» uses, for the same reason.
    if (!window.confirm(c.removeConfirm)) return;
    setRemoving(true);
    const result = await deleteExpenseAction(row.id);
    setRemoving(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent closeLabel={copy.admin.common.cancel}>
          <DialogHeader>
            <DialogTitle>{c.formTitleEdit}</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            key={String(editing)}
            books={books}
            existing={row}
            onDone={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" className="size-3.5" />
        {c.edit}
      </Button>
      <Button type="button" variant="danger" size="sm" onClick={remove} disabled={removing}>
        <Trash2 aria-hidden="true" className="size-3.5" />
        {c.remove}
      </Button>
    </div>
  );
}
