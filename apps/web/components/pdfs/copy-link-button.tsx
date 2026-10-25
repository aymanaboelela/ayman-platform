'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';

/**
 * «انسخ اللينك» — the page's absolute URL, for pasting under a video or into a
 * WhatsApp group. The PAGE, not the file: the page is what gets indexed and
 * what still makes sense if someone opens it on a laptop later.
 */
export function CopyLinkButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      <Link2 className="size-4" aria-hidden="true" />
      {copied ? pdfsCopy.shared : pdfsCopy.share}
    </button>
  );
}
