'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Laptop, Link2, RotateCcw, Share2, Smartphone, Tablet, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.player;

/**
 * What a student on a network that blocks YouTube sees in place of the video —
 * see `youtube-reach.ts` for how the player knows.
 *
 * The one thing that actually helps is getting the lecture onto another
 * device, so that is the primary action: the share sheet where there is one
 * (the tablets are Android — WhatsApp is one tap from there), the clipboard
 * where there is not. «محاولة تانية» is for the false alarm — a network that
 * was only slow — and tries the real player again rather than trusting the
 * probe a second time.
 *
 * Sized for the player box on a phone in portrait (about 200 px tall): the
 * icon and the spacing give way first, and the box scrolls before anything is
 * clipped.
 */
export function YouTubeBlockedCard({
  youtubeId,
  title,
  onRetry,
}: {
  youtubeId: string;
  title: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Read once, lazily: the card only ever mounts after a tap, in the browser.
  const [canShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2_500);
    return () => clearTimeout(id);
  }, [copied]);

  const sendLink = async () => {
    const url = window.location.href;
    if (canShare) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard either (an old WebView): the address bar still has it.
    }
  };

  return (
    <div
      role="status"
      className={cn(
        'absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-3 sm:px-8 sm:py-6',
        'bg-gradient-to-b from-accent/10 via-surface-2 to-surface-2',
      )}
    >
      <div className="flex max-w-lg flex-col items-center gap-2 text-center sm:gap-3">
        {/*
          The message before anyone reads it: this device ✕, those two ✓.
          Hidden on a phone, where the box is about 200 px tall and the words
          and the button matter more than the picture.
        */}
        <div aria-hidden="true" className="mb-1 hidden items-center gap-3 sm:flex">
          {/* On its side: upright it is the phone's twin, and the picture would read «phone ✕ → phone ✓». */}
          <DeviceBadge tone="no">
            <Tablet className="h-7 w-7 rotate-90" />
          </DeviceBadge>
          <ArrowLeft className="h-5 w-5 text-fg-muted" />
          <DeviceBadge tone="yes">
            <Smartphone className="h-6 w-6" />
          </DeviceBadge>
          <DeviceBadge tone="yes">
            <Laptop className="h-7 w-7" />
          </DeviceBadge>
        </div>
        <p className="text-[length:var(--fs-text-base)] font-semibold text-fg sm:text-[length:var(--fs-text-lg)]">{c.videoBlockedTitle}</p>
        <p className="text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted sm:text-[length:var(--fs-text-sm)]">
          {c.videoBlockedBody}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void sendLink()}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-[#1A1206]',
              'text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] hover:bg-accent-hover',
            )}
          >
            {copied ? (
              <Check aria-hidden="true" className="h-4 w-4" />
            ) : canShare ? (
              <Share2 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Link2 aria-hidden="true" className="h-4 w-4" />
            )}
            {copied ? c.videoBlockedCopied : canShare ? c.videoBlockedShare : c.videoBlockedCopy}
          </button>
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-fg',
              'text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] hover:bg-surface-3',
            )}
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            {c.videoBlockedRetry}
          </button>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noreferrer"
          className="text-[length:var(--fs-text-xs)] text-fg-muted underline"
        >
          {c.videoBlockedOpenYouTube}
        </a>
      </div>
    </div>
  );
}

/** One device in the picture at the top: muted with a ✕, or accented with a ✓. */
function DeviceBadge({ tone, children }: { tone: 'yes' | 'no'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'relative grid h-14 w-14 place-items-center rounded-2xl',
        tone === 'yes' ? 'bg-accent/15 text-accent-text' : 'bg-surface-3 text-fg-muted',
      )}
    >
      {children}
      <span
        className={cn(
          'absolute -top-1 -end-1 grid h-5 w-5 place-items-center rounded-full text-white',
          tone === 'yes' ? 'bg-ok' : 'bg-err',
        )}
      >
        {tone === 'yes' ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
      </span>
    </span>
  );
}
