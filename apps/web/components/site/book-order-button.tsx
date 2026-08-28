'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { withNext } from '@/lib/safe-next';
import { formatEGP } from '@/lib/price';
import { BookOrderPanel } from './book-order-panel';

/**
 * «اطلب الكتاب» — the entry point into the book-order flow from the public
 * course page. Shown only when the course has a book configured
 * (`bookTitle`/`bookPriceCents` both non-null — see `Course.bookTitle`).
 *
 * Unlike `CourseStartButton`, this never calls an "enroll"-shaped endpoint
 * first: ordering a book grants no course access, so there is no 403 branch
 * to react to. The dialog opens directly; a signed-out visitor only
 * discovers they need to sign in if the ADDRESS step's own submit 401s —
 * `BookOrderPanel`'s own `onUnauthorized` prop is what this button reacts to,
 * rare in practice since the platform is login-gated well before a student
 * reaches a course page at all.
 */
export function BookOrderButton({
  courseId,
  slug,
  bookTitle,
  bookPriceCents,
  vodafoneCash,
}: {
  courseId: string;
  slug: string;
  bookTitle: string;
  bookPriceCents: number;
  vodafoneCash: string | null;
}) {
  const router = useRouter();
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
            onUnauthorized={() => {
              setOpen(false);
              router.push(withNext('/login', `/courses/${encodeURIComponent(slug)}`));
            }}
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
