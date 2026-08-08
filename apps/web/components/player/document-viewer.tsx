import { copy, type PlayerResource } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { DownloadIcon } from './icons';

/**
 * The founder's requirement, verbatim: a deck opens like a page, and still has
 * somewhere to download from.
 *
 * The `src` is on OUR origin. That is forced, not preferred —
 * `GET /media/:prefix/:name` is `@Public()`, so a document behind an
 * enrollment cannot be served from there. Framing our own origin is made safe
 * by the RESPONSE, which carries `Content-Security-Policy: default-src 'none';
 * sandbox`: the document lands in a unique opaque origin with no script
 * execution, whatever it turns out to contain.
 *
 * Consequently there is no `sandbox` ATTRIBUTE on the element. Adding one
 * would be redundant with the response header and, worse, `sandbox` without
 * `allow-scripts` breaks the built-in PDF viewer in Chrome — a strictly worse
 * outcome for no additional protection.
 *
 * An `<iframe>` rather than an `<object>`/`<embed>` because the shared CSP sets
 * `object-src 'none'`, and loosening that to render a PDF would be a far worse
 * trade than adding `'self'` to `frame-src`.
 */
export function DocumentViewer({ resource }: { resource: PlayerResource }) {
  // Narrowing for the type checker as much as for safety: `viewPath` and
  // `downloadPath` are null for video and link resources by construction.
  if (resource.viewPath === null || resource.downloadPath === null) return null;

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <iframe
        src={resource.viewPath}
        title={resource.title}
        className="block h-[36rem] w-full border-0 bg-surface-2"
        loading="lazy"
      />
      {/*
        The storage FILENAME used to sit here, and it is gone on purpose.

        Two reasons, and either alone would be enough. It is meaningless to a
        student — the resource's own Arabic title is directly above this box and
        says what the file is. And it was frequently unreadable: multer decodes
        the multipart filename as latin1, so «أساسيات البرمجة - المحاضرة
        الأولى.pdf» rendered as «Ø£Ø³Ø§Ø³ÙØ§Øª Ø§ÙØ¨Ø±ÙØ¬Ø©…» under every
        lecture. `decodeOriginalName` fixes that for new uploads, but the rows
        already stored stay broken forever — and «مش عايز مسار الملف بتاع PDF
        يبقى ظاهر كده» is the right call regardless of encoding.

        What replaces it is the thing a student actually wants: one obvious
        «نزّل المحاضرة». A real button, not a mono link the width of its own
        text — this is the second most likely thing to press on the page after
        the video, and it read like a footnote.
      */}
      <div className="flex justify-end border-t border-line bg-surface-2 px-4 py-3">
        <a
          href={resource.downloadPath}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2',
            'border border-line-strong bg-surface-3 text-[length:var(--fs-text-sm)] font-semibold text-fg',
            'transition-colors duration-[160ms] ease-out',
            'hover:border-accent hover:bg-surface-1 hover:text-accent-text',
          )}
        >
          <DownloadIcon className="h-4 w-4" />
          {copy.player.download}
        </a>
      </div>
    </div>
  );
}
