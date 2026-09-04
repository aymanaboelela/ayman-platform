'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { formatEGP, formatShipping } from '@/lib/price';
import { BookOrderPanel } from './book-order-panel';

/**
 * Whether «اطلب الكتاب» belongs on a course surface at all.
 *
 * Three surfaces ask this question — the public course page, the dashboard's
 * `EnrolledCourseCard` and the player's `CourseOutlineSidebar` — and they used
 * to answer it with three copies of `bookTitle !== null && bookPriceCents !==
 * null`. One helper, because the rule behind those two fields has changed under
 * them and three copies is how one screen keeps the old one.
 *
 * ## Why placement is NOT checked here
 *
 * `books.show_on_course` is the admin's «الكتاب ده يتباع من قسم الكتب بس», and
 * it is tempting to read it on this side. It is enforced on the API side
 * instead — `courseBook()` in `catalog.service.ts` returns
 * `bookTitle: null, bookPriceCents: null` for a live book whose flag is off, so
 * a course that must not advertise its book arrives here with nothing to
 * advertise.
 *
 * That is not merely tidier, it is the only correct place for it. These three
 * surfaces read THREE different payloads (`CatalogCourseDetail`, the dashboard's
 * enrolled-course row, the player's outline), and a flag added to the public
 * contract would have to be threaded through all three and every serializer
 * between — with a missing one showing up as a button that quietly keeps
 * appearing on the screen nobody checked. Deriving the title and the price from
 * the same decision means there is no second field to forget: no title, no
 * button, everywhere, already.
 */
export function courseBookCtaVisible(course: {
  bookTitle: string | null;
  bookPriceCents: number | null;
}): boolean {
  return course.bookTitle !== null && course.bookPriceCents !== null;
}

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
