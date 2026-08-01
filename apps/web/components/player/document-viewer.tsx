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
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-2">
        <span className="mono tabular min-w-0 truncate text-[length:var(--fs-mono-label)] text-fg-muted">
          {resource.filename}
        </span>
        <a
          href={resource.downloadPath}
          className={cn(
            'mono inline-flex shrink-0 items-center gap-1.5',
            'text-[length:var(--fs-mono-label)] text-accent-text',
            'transition-colors duration-[160ms] ease-out hover:text-accent',
          )}
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          {copy.player.download}
        </a>
      </div>
    </div>
  );
}
