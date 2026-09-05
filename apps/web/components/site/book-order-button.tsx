'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { formatEGP, formatShipping } from '@/lib/price';
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
  shippingCents,
  vodafoneCash,
}: {
  courseId: string;
  bookTitle: string;
  bookPriceCents: number;
  /**
   * The delivery fee, from `GET /api/books`.
   *
   * ⚠️ This flow did not charge one before «قسم الكتب» shipped, and now it does.
   * Deliberate: it is the same parcel to the same address as a shop order, and
   * one path quietly shipping for free was the inconsistency. The button below
   * therefore quotes the TOTAL rather than the book's price alone — a CTA that
   * says «٢٥٠ جنيه» and a form that then asks for ٣١٥ is the surprise this
   * feature is supposed to remove.
   */
  shippingCents: number;
  vodafoneCash: string | null;
}) {
  const [open, setOpen] = useState(false);
  const totalCents = bookPriceCents + shippingCents;

  return (
    <div className="course-start">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={copy.bookOrder.back}>
          <DialogHeader>
            <DialogTitle>{bookTitle}</DialogTitle>
          </DialogHeader>
          {/* The breakdown, stated before the address form rather than as a
              total the reader has to take on trust. Same three rows the shop's
              basket shows, for the same reason. */}
          <div className="books-checkout__summary">
            <div className="books-cart__row">
              <span>{copy.books.subtotal}</span>
              <span>{formatEGP(bookPriceCents)}</span>
            </div>
            <div className="books-cart__row">
              <span>{copy.books.shipping}</span>
              <span>{formatShipping(shippingCents, copy.books.shippingFree)}</span>
            </div>
            <div className="books-cart__row books-cart__row--total">
              <span>{copy.books.total}</span>
              <span>{formatEGP(totalCents)}</span>
            </div>
          </div>
          <BookOrderPanel
            courseId={courseId}
            amountCents={totalCents}
            vodafoneCash={vodafoneCash}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Button type="button" onClick={() => setOpen(true)} variant="secondary" className="w-full">
        {formatCopy(copy.bookOrder.ctaWithPrice, {
          cta: copy.bookOrder.cta,
          price: formatEGP(totalCents),
        })}
      </Button>
    </div>
  );
}
