'use client';

import { useEffect, useRef } from 'react';
import { copy } from '@ayman/contracts/copy/admin';

const c = copy.admin.books;

/**
 * «اطبع / احفظ PDF» — and the print dialog opening by itself, once.
 *
 * ## Why it opens on its own
 *
 * The ask was a DOWNLOAD («وانا بعمل تحميل يتعمل PDF»). One click on the
 * orders screen has to end at a file, so the tab that opens goes straight to
 * the dialog where «حفظ كـ PDF» lives. The button stays for the second print
 * and for the browser that refuses to open it unprompted.
 *
 * ## Why `once`
 *
 * React runs effects twice in development, and `window.print()` is modal: the
 * second call lands on a page already showing a dialog and is either swallowed
 * or queues a second one behind the first. The ref makes it idempotent for the
 * life of the tab, so a re-render from anything (a router refresh, a devtools
 * hot update) does not reopen a dialog the admin just dismissed.
 */
export function PrintButton() {
  const printed = useRef(false);

  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    /* One frame after paint. Calling `print()` inside the effect itself
       snapshots a page the browser has not laid out yet, which on a long list
       prints a first page of empty table rows. */
    const id = window.requestAnimationFrame(() => window.print());
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-accent px-4 py-1.5 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]"
    >
      {c.printButton}
    </button>
  );
}
