'use client';

import { useRef, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { referralsCopy as c } from '@ayman/contracts/copy/referrals';
import { cn } from '@ayman/ui/lib/cn';

/**
 * The link, «نسخ اللينك» and «مشاركة على واتساب».
 *
 * The copy button has two paths for the reason `GuardianCodeCard` gives:
 * `navigator.clipboard` fails on plain http and in some older browsers, and a
 * press that does nothing reads as a broken button — so a hidden input is
 * selected and copied the old way when the first path throws.
 *
 * WhatsApp is `wa.me/?text=` with no number: the student picks the chat, and
 * the message (composed on the server from the copy table) carries the link
 * alone on its last line so WhatsApp draws its preview.
 */
export function InviteShare({ url, message }: { url: string; message: string }) {
  const [copied, setCopied] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);

  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      flash();
      return;
    } catch {
      // The second path below.
    }
    const input = fallbackRef.current;
    if (!input) return;
    input.select();
    try {
      document.execCommand('copy');
      flash();
    } catch {
      // No third path — the link is on screen either way.
    }
  }

  return (
    <div className="rf-share">
      <p className="rf-share__label">{c.linkLabel}</p>
      <p className="rf-share__link" dir="ltr">
        {url}
      </p>
      <div className="rf-share__actions">
        <button
          type="button"
          onClick={() => void copyLink()}
          className={cn('rf-btn rf-btn--copy', copied && 'rf-btn--done')}
          aria-live="polite"
        >
          {copied ? <Check className="size-5" aria-hidden="true" /> : <Copy className="size-5" aria-hidden="true" />}
          {copied ? c.copied : c.copyLink}
        </button>
        <a
          className="rf-btn rf-btn--whatsapp"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          {c.shareWhatsapp}
        </a>
      </div>
      {/* `readOnly`, not `disabled` — a disabled input cannot be selected, and
          `execCommand('copy')` copies a selection. */}
      <input
        ref={fallbackRef}
        readOnly
        value={url}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute size-px opacity-0"
      />
    </div>
  );
}
