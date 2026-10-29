'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * The Vodafone Cash screenshot for a book order — identical shape to
 * `PaymentScreenshotThumbnail` in `/admin/payments`, just pointed at the
 * book-orders screenshot route. See that component's own docblock for why
 * this is a plain `<img>` (never `next/image`) and a modal (never a new tab).
 */
export function BookOrderScreenshotThumbnail({ id, alt }: { id: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/admin/book-orders/${id}/screenshot`;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 overflow-hidden rounded-lg border border-line transition-opacity duration-[160ms] ease-out hover:opacity-80"
      >
        <img src={src} alt={alt} className="block size-16 object-cover" loading="lazy" />
      </button>

      {/* Portalled to `body`: `.admin-main > * > *` keeps a transform
          animation filled, which makes that wrapper the containing block for
          `position: fixed` — the overlay sized itself to the whole list and
          centred the picture far below the screen, so a click looked dead. */}
      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black p-6"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={copy.admin.common.close}
                className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-accent text-[#1A1206] shadow-lg transition-colors duration-[160ms] ease-out hover:bg-accent/85"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              <img
                src={src}
                alt={alt}
                onClick={(event) => event.stopPropagation()}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
