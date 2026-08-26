'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * The Vodafone Cash screenshot: a small thumbnail right in the row, and a
 * full-size lightbox on click.
 *
 * It used to be a text link opening `/api/.../screenshot` in a new tab —
 * reading it meant a round trip out of the review queue and back, and the
 * image itself was invisible until that tab loaded. A reviewing admin's whole
 * job on this row is "does this picture match the claim", so the picture has
 * to be ON the row.
 *
 * ## Why a plain `<img>`, twice
 *
 * Same reasoning as `MessageAttachmentView`: the bytes come from a
 * `payment:read`-gated route that re-checks the session on every request, so
 * `next/image`'s optimizer — which fetches through its own `/_next/image`
 * route and caches the result publicly — would hand a private payment proof
 * to a cacheable path. The thumbnail and the lightbox image both request the
 * SAME url; the browser's own HTTP cache is what makes the second paint
 * instant rather than a second round trip.
 *
 * ## Why this is a modal and never a new tab
 *
 * Asked for by name: clicking the thumbnail opens an overlay with an ✕,
 * never `target="_blank"`. A new tab leaves the review queue's scroll
 * position and its pending/approved filter behind; a lightbox does not.
 */
export function PaymentScreenshotThumbnail({ id, alt }: { id: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/admin/payments/submissions/${id}/screenshot`;

  // Escape closes it — the keyboard-only path to the same place the ✕ and the
  // backdrop click both lead. Only listens while actually open, so this never
  // competes with some OTHER dialog's own Escape handler elsewhere on the page.
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
        {/* A plain `<img>`, deliberately — see the header note: a private,
            session-gated route, never `next/image`. */}
        <img src={src} alt={alt} className="block size-16 object-cover" loading="lazy" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={copy.admin.common.close}
            className="absolute end-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors duration-[160ms] ease-out hover:bg-white/20"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          {/* Same route as the thumbnail above — same reasoning. */}
          <img
            src={src}
            alt={alt}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      ) : null}
    </>
  );
}
