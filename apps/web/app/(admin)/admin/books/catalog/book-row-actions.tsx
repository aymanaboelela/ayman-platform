'use client';

import { useState, useTransition } from 'react';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { deleteBookAction, patchBookAction } from './actions';

const c = copy.admin.books;

/**
 * The two row actions: hide, and delete.
 *
 * ## Why «اخفيه» leads and «امسح» is second
 *
 * Taking a book off the shelf is what an admin actually wants nine times in
 * ten — a title sells out, or comes back next term — and it is reversible with
 * one press. Deleting is not, and a title that returns would have to be retyped
 * from scratch. So hiding is a plain button and deleting sits behind a
 * `confirm`, which is this admin's convention for anything irreversible.
 *
 * ## Deleting is safer here than "delete a product" usually is
 *
 * `book_order_items.book_id` is `ON DELETE SET NULL`, and every line keeps its
 * own `title_ar` and `unit_price_cents`. So an order that bought this book
 * survives it intact, still showing what was bought and for how much. The
 * confirm says so, because "will this erase my orders?" is exactly the question
 * that stops someone pressing it.
 */
export function BookRowActions({ book }: { book: AdminBookRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      const result = await patchBookAction(book.id, { isActive: !book.isActive });
      setError(result.ok ? null : result.message);
    });
  }

  function remove() {
    if (!window.confirm(c.catalogDeleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteBookAction(book.id);
      setError(result.ok ? null : result.message);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={toggleActive} disabled={pending}>
        {book.isActive ? c.catalogHide : c.catalogShow}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
        {c.catalogDelete}
      </Button>
      {error ? (
        <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
