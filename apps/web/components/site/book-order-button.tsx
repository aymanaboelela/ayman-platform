'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import type { BookShippingRates } from '@ayman/contracts/books';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
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
  shippingRates,
  instapay,
  vodafoneCash,
}: {
  courseId: string;
  bookTitle: string;
  bookPriceCents: number;
  /**
   * The three delivery rates, from `GET /api/books`.
   *
   * ⚠️ This flow did not charge delivery at all before «قسم الكتب» shipped, and
   * now it does, and since 2026-09-16 the amount depends on the governorate.
   * The CTA therefore quotes «الكتاب + الشحن من …» rather than one total: a
   * button that promised ٢٣٠ and a form that then asked for ٣٠٠ is exactly the
   * surprise the breakdown exists to remove, and a single total became a
   * promise this button cannot keep the moment delivery became zoned.
   */
  shippingRates: BookShippingRates;
  instapay: string | null;
  /** The wallet number, threaded beside `instapay` — see `ContactSchema`. */
  vodafoneCash: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="course-start">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={copy.bookOrder.back}>
          <DialogHeader>
            <DialogTitle>{bookTitle}</DialogTitle>
          </DialogHeader>
          {/* ⚠️ The breakdown MOVED INTO the panel. It has to update when the
              governorate select changes, and that select is inside the panel —
              a copy out here would be a second, frozen answer to the same
              question, sitting directly above the live one. */}
          <BookOrderPanel
            courseId={courseId}
            itemsCents={bookPriceCents}
            shippingRates={shippingRates}
            instapay={instapay}
            vodafoneCash={vodafoneCash}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/*
        «اطلب الكتاب», and nothing else on the button.

        It used to carry the whole quote — «اطلب الكتاب — ١٥٠ جنيه + مصاريف
        الشحن والشحن من ٨٠ على حسب المحافظة». That is one unbreakable line
        (the button is `nowrap`), and this same component renders inside the
        lesson page's outline rail, which is a ~336px column: its min-content
        width became the panel's width and the card hung out past its own
        track, clipped at both edges. Reported as «كبيرة الكلام» with a shot
        of the sentence running out of the sidebar.

        Nothing is lost by moving it: the dialog this opens shows the book's
        price, the delivery fee for the governorate picked, and the total —
        live, and one tap away. The button's job was never to be the invoice.
      */}
      <Button type="button" onClick={() => setOpen(true)} variant="secondary" className="w-full">
        {copy.bookOrder.cta}
      </Button>
    </div>
  );
}
