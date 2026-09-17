'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ExpenseCategorySchema,
  type AdminExpenseRow,
  type ExpenseCategory,
} from '@ayman/contracts/admin/expenses';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { createExpenseAction, updateExpenseAction } from './actions';

const c = copy.admin.expenses;
const cat = copy.admin.expenseCategory;

export interface BookOption {
  id: string;
  titleAr: string;
}

/** Whole pounds typed by a human → piastres. `null` for anything that is not a
 *  finite non-negative number, which the caller turns into a field error rather
 *  than sending a `NaN` the API would reject with a 400 nobody can read. */
function centsOf(pounds: string): number | null {
  const trimmed = pounds.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/** Today as `YYYY-MM-DD` in the LOCAL calendar — the date the admin would write
 *  on a receipt. `toISOString()` would hand back UTC, which after 22:00 Cairo
 *  is already tomorrow. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * One form for both «أضف مصروف» and «تعديل».
 *
 * The two differ only in which action runs and what the fields start at, and
 * splitting them would leave two places to keep the book/quantity rule in step
 * — the rule the database enforces with a CHECK and the contract with a refine.
 */
export function ExpenseForm({
  books,
  existing,
  onDone,
}: {
  books: readonly BookOption[];
  /** Absent for a new row. */
  existing?: AdminExpenseRow;
  onDone: () => void;
}) {
  const [occurredOn, setOccurredOn] = useState(existing?.occurredOn ?? today());
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category ?? 'filming');
  const [pounds, setPounds] = useState(
    existing ? String(existing.amountCents / 100) : '',
  );
  const [titleAr, setTitleAr] = useState(existing?.titleAr ?? '');
  const [noteAr, setNoteAr] = useState(existing?.noteAr ?? '');
  const [bookId, setBookId] = useState(existing?.bookId ?? '');
  const [quantity, setQuantity] = useState(
    existing?.quantity !== null && existing?.quantity !== undefined
      ? String(existing.quantity)
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const amountCents = centsOf(pounds);
    if (amountCents === null) {
      setError(c.fieldAmount);
      return;
    }
    const parsedQuantity = quantity.trim() === '' ? null : Number(quantity);
    if (bookId !== '' && (parsedQuantity === null || !Number.isInteger(parsedQuantity))) {
      // The same rule the CHECK enforces, met here as a sentence rather than as
      // a 500 — a row naming a book with no count cannot say what it bought.
      setError(c.fieldQuantity);
      return;
    }

    setError(null);
    setSaving(true);
    const payload = {
      occurredOn,
      category,
      amountCents,
      titleAr: titleAr.trim(),
      noteAr: noteAr.trim() === '' ? null : noteAr.trim(),
      bookId: bookId === '' ? null : bookId,
      quantity: bookId === '' ? null : parsedQuantity,
    };
    const result = existing
      ? await updateExpenseAction(existing.id, payload)
      : await createExpenseAction(payload);
    setSaving(false);

    if (result.ok) {
      toast.success(copy.admin.common.saved);
      onDone();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="expense-date" required>
            {c.fieldDate}
          </Label>
          <Input
            id="expense-date"
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
          />
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.fieldDateHint}</p>
        </div>

        <div>
          <Label htmlFor="expense-category" required>
            {c.fieldCategory}
          </Label>
          <Select
            id="expense-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
          >
            {ExpenseCategorySchema.options.map((option) => (
              <option key={option} value={option}>
                {cat[option]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="expense-title" required>
          {c.fieldTitle}
        </Label>
        <Input
          id="expense-title"
          value={titleAr}
          maxLength={160}
          placeholder={c.fieldTitlePlaceholder}
          onChange={(event) => setTitleAr(event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="expense-amount" required>
          {c.fieldAmount}
        </Label>
        <Input
          id="expense-amount"
          type="number"
          min={1}
          inputMode="decimal"
          value={pounds}
          onChange={(event) => setPounds(event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="expense-note">{c.fieldNote}</Label>
        <Textarea
          id="expense-note"
          value={noteAr}
          maxLength={2000}
          rows={2}
          onChange={(event) => setNoteAr(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="expense-book">{c.fieldBook}</Label>
          <Select
            id="expense-book"
            value={bookId}
            onChange={(event) => setBookId(event.target.value)}
          >
            <option value="">{c.fieldBookNone}</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.titleAr}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.fieldBookHint}</p>
        </div>

        <div>
          <Label htmlFor="expense-quantity" required={bookId !== ''}>
            {c.fieldQuantity}
          </Label>
          <Input
            id="expense-quantity"
            type="number"
            min={1}
            value={quantity}
            /* Disabled rather than hidden while no book is chosen: it mirrors
               `expenses_book_needs_quantity`, and a field that vanishes reads
               as a bug where one that greys out reads as a dependency. */
            disabled={bookId === ''}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[var(--err)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={saving || titleAr.trim().length < 2 || pounds.trim() === ''}
        >
          {saving ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </div>
  );
}
