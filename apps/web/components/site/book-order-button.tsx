'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { formatEGP } from '@/lib/price';
import { BookOrderPanel } from './book-order-panel';

/**
 * «اطلب الكتاب» — the entry point into the book-order flow from the public
 * course page. Shown only when the course has a book configured
 * (`bookTitle`/`bookPriceCents` both non-null — see `Course.bookTitle`).
 *
 * ## No account required, and no login redirect left to wire up
 *
 * Ordering the physical textbook is "a different service" from the
 * platform's login-gated course content (Ayman) — the course landing page is
 * already public, so a complete stranger has to be able to fill the address
 * form and pay with zero account friction. `POST /api/book-orders` and
 * `POST /api/book-orders/:id/payment` are `@Public()` now, so `BookOrderPanel`
 * no longer has a 401 branch to react to and this button carries no
 * `onUnauthorized`/login-redirect wiring at all. `CourseStartButton`'s own
 * 401→login redirect is unrelated and untouched — enrolling in a course
 * still requires an account.
 */
export function BookOrderButton({
  courseId,
  bookTitle,
  bookPriceCents,
  vodafoneCash,
}: {
  courseId: string;
  bookTitle: string;
  bookPriceCents: number;
  vodafoneCash: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="course-start">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={copy.bookOrder.back}>
          <DialogHeader>
            <DialogTitle>{copy.bookOrder.title}</DialogTitle>
          </DialogHeader>
          <BookOrderPanel
            courseId={courseId}
            bookTitle={bookTitle}
            bookPriceCents={bookPriceCents}
            vodafoneCash={vodafoneCash}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Button type="button" onClick={() => setOpen(true)} variant="secondary" className="w-full">
        {formatCopy(copy.bookOrder.ctaWithPrice, {
          cta: copy.bookOrder.cta,
          price: formatEGP(bookPriceCents),
        })}
      </Button>
    </div>
  );
}
