'use client';

import { useState } from 'react';
import { copy, type PlayerResource } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { DocumentIcon, DownloadIcon, SlidesIcon } from './icons';

/**
 * A document: a card first, its viewer only when asked for.
 *
 * ## Why the iframe no longer renders on sight
 *
 * The founder's original requirement was "a deck opens like a page, and still
 * has somewhere to download from", and this component answered it by embedding
 * a 36rem-tall PDF viewer inline. Under a video lesson that meant every page
 * carried a second scroll area, competing with the page's own, showing slides
 * nobody had opened. «مش عايز PDF يكون ظهر لي على طول… عايز يبقى أيقونة يعني
 * أو مكان كده كارد أضغط عليه يوديني للـPDF.»
 *
 * It still opens like a page — one press away, in place, without leaving the
 * lesson. What changed is who decides when.
 *
 * ## Why the frame is still same-origin, and still safe
 *
 * `GET /media/:prefix/:name` is `@Public()`, so a document behind an enrollment
 * cannot be served from the media origin. Framing our own origin is made safe
 * by the RESPONSE, which carries `Content-Security-Policy: default-src 'none';
 * sandbox` — the document lands in a unique opaque origin with no script
 * execution, whatever it turns out to contain.
 *
 * Consequently there is no `sandbox` ATTRIBUTE here. It would be redundant with
 * the response header and, worse, `sandbox` without `allow-scripts` breaks
 * Chrome's built-in PDF viewer — strictly worse for no additional protection.
 *
 * An `<iframe>` rather than `<object>`/`<embed>` because the shared CSP sets
 * `object-src 'none'`, and loosening that to render a PDF would be a far worse
 * trade than adding `'self'` to `frame-src`.
 */
export function DocumentViewer({ resource }: { resource: PlayerResource }) {
  const [open, setOpen] = useState(false);

  // Narrowing for the type checker as much as for safety: `viewPath` and
  // `downloadPath` are null for video and link resources by construction.
  if (resource.viewPath === null || resource.downloadPath === null) return null;

  const Icon = resource.kind === 'presentation' ? SlidesIcon : DocumentIcon;

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="flex items-center gap-3 bg-surface-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-3 text-accent-text">
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            {/*
              The resource's own TITLE, which the instructor typed in Arabic.
              The storage filename used to sit under here and is gone: it is a
              server detail, and for an Arabic upload it rendered as mojibake
              («Ø£Ø³Ø§Ø³ÙØ§Øª…») because multer decodes the multipart filename
              as latin1. `decodeOriginalName` fixes new uploads; the rows
              already stored stay broken, and the name was never worth showing.
            */}
            <span className="block truncate font-medium text-fg">{resource.title}</span>
            <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">
              {open ? copy.player.closeDocument : copy.player.openDocument}
            </span>
          </span>
        </button>

        {/* Outside the toggle, deliberately: downloading and previewing are two
            different intentions, and nesting a link inside a button is invalid
            markup that Safari resolves by swallowing one of them. */}
        <a
          href={resource.downloadPath}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2',
            'border border-line-strong bg-surface-3 text-[length:var(--fs-text-sm)] font-semibold text-fg',
            'transition-colors duration-[160ms] ease-out',
            'hover:border-accent hover:bg-surface-1 hover:text-accent-text',
          )}
        >
          <DownloadIcon className="h-4 w-4" />
          {copy.player.download}
        </a>
      </div>

      {open ? (
        <iframe
          src={resource.viewPath}
          title={resource.title}
          /*
            Taller than the old 36rem: once it is opened deliberately, the
            reason to open it is to read it. That holds in a 900px window and
            inverts in a 567px one — a flat 42rem (672px) on a 360×640 phone is
            taller than the screen and spans the full content column, so there
            is no gutter left to scroll the page in: the page's scroll and the
            embedded viewer's own scroll fight over the same gesture, and the
            wrapper's `overflow-hidden rounded-md` means the reader cannot
            resize their way out either.

            `min()` keeps both intentions. Above a 960px-tall window the 42rem
            ceiling wins and desktop renders exactly as before; below it the
            viewer takes 70% of the visible viewport and leaves a real margin
            to scroll the lesson in.

            `dvh` and not `vh`: `vh` is fixed to the LARGEST viewport on mobile,
            so with the Android URL bar expanded the box would still overflow —
            the exact failure being fixed. `dvh` also means the box grows when
            the bar collapses, which is the right way round.
          */
          className="block h-[min(42rem,70dvh)] w-full border-0 border-t border-line bg-surface-2"
          loading="lazy"
        />
      ) : null}
    </div>
  );
}
