import { copy } from '@ayman/contracts/copy';
import { driveEmbedUrl, extractDriveFileId, extractYouTubeId } from '@ayman/contracts/video';
import type { PlayerResource } from '@ayman/contracts/progress';
import { Card, CardBody } from '@ayman/ui/components/card';
import { cn } from '@ayman/ui/lib/cn';
import { DocumentViewer } from './document-viewer';
import { DocumentIcon, LinkIcon, SlidesIcon, VideoIcon } from './icons';

const c = copy.player;

/**
 * Shown to the student so a link's destination is legible BEFORE they click
 * it. The URL is https-validated on write and by a database CHECK, so the
 * catch is not a fallback anyone should reach — it is there so one malformed
 * legacy row renders a name instead of taking the whole lesson page down.
 */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function ResourceIcon({ kind }: { kind: PlayerResource['kind'] }) {
  const className = 'text-fg-muted';
  if (kind === 'presentation') return <SlidesIcon className={className} />;
  if (kind === 'video') return <VideoIcon className={className} />;
  if (kind === 'link') return <LinkIcon className={className} />;
  return <DocumentIcon className={className} />;
}

/**
 * ONE player, used by a `video` resource and by a `link` that turned out to
 * point at YouTube. Two copies of these `allow` attributes is two places for
 * them to drift.
 */
function YouTubeFrame({ youtubeId, title }: { youtubeId: string; title: string }) {
  return (
    <div className="aspect-video overflow-hidden rounded-md border border-line">
      <iframe
        // Rebuilt from the 11-character id. A stored URL here would
        // reintroduce the SSRF class the extractor exists to eliminate.
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
        title={title}
        className="block h-full w-full border-0"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function VideoResource({ resource }: { resource: PlayerResource }) {
  if (resource.youtubeId === null) return null;
  return <YouTubeFrame youtubeId={resource.youtubeId} title={resource.title} />;
}

/**
 * A link the student can use where they already are, when we know how.
 *
 * Recognition happens HERE, at render, rather than when the instructor saves.
 * That covers every row already written — including the ones added before this
 * shipped — and it means an instructor keeps pasting links exactly as they
 * always have. Both extractors parse and discard; neither fetches anything.
 *
 * Anything we do not recognise stays the anchor it was. That is the correct
 * answer for the majority of links, not a fallback we tolerate.
 */
function LinkResource({ resource }: { resource: PlayerResource }) {
  if (resource.linkUrl === null) return null;

  const youtubeId = extractYouTubeId(resource.linkUrl);
  if (youtubeId !== null) {
    return (
      <>
        <YouTubeFrame youtubeId={youtubeId} title={resource.title} />
        <OpenExternally url={resource.linkUrl} />
      </>
    );
  }

  const drive = extractDriveFileId(resource.linkUrl);
  if (drive !== null) {
    return (
      <>
        <div className="aspect-video overflow-hidden rounded-md border border-line">
          <iframe
            // Built from the extracted id against a hardcoded origin — see
            // `driveEmbedUrl`. Never the pasted URL.
            src={driveEmbedUrl(drive)}
            title={resource.title}
            className="block h-full w-full border-0"
            loading="lazy"
          />
        </div>
        <OpenExternally url={resource.linkUrl} />
      </>
    );
  }

  return <ExternalLinkCard resource={resource} />;
}

/**
 * Beside every embed, never instead of one.
 *
 * A Drive preview of a file the student cannot open renders as Google's own
 * "you need permission" page inside our frame, and a YouTube video whose owner
 * disabled embedding renders as a refusal. Embedding must not be a trap: there
 * is always a door out.
 */
function OpenExternally({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mono mt-2 inline-block text-[length:var(--fs-mono-label)] text-fg-muted underline underline-offset-2 hover:text-accent-text"
    >
      {c.openInNewTab}
    </a>
  );
}

function ExternalLinkCard({ resource }: { resource: PlayerResource }) {
  if (resource.linkUrl === null) return null;
  const host = hostnameOf(resource.linkUrl);

  return (
    <a
      href={resource.linkUrl}
      target="_blank"
      // noopener so the opened tab cannot reach back through window.opener;
      // noreferrer so our authenticated URLs are not sent to a third party.
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-md border border-line px-4 py-3',
        'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
      )}
    >
      <LinkIcon className="text-fg-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg">{resource.title}</span>
        {host === null ? null : (
          <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
            {host}
          </span>
        )}
      </span>
      <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-accent-text">
        {c.openInNewTab}
      </span>
    </a>
  );
}

export function ResourceList({ resources }: { resources: PlayerResource[] }) {
  if (resources.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-fg-muted">{c.noResources}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <ul className="space-y-6">
      {resources.map((resource) => {
        const isFile = resource.kind === 'presentation' || resource.kind === 'document';
        return (
          <li key={resource.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <ResourceIcon kind={resource.kind} />
              <h3 className="min-w-0 text-[length:var(--fs-title-4)] font-medium text-fg">
                {resource.title}
              </h3>
              {resource.kind === 'presentation' ? (
                <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-accent-text">
                  {c.mainPresentation}
                </span>
              ) : null}
            </div>

            {resource.description === null ? null : (
              <p className="mb-3 text-[length:var(--fs-text-sm)] text-fg-muted">
                {resource.description}
              </p>
            )}

            {resource.kind === 'video' ? <VideoResource resource={resource} /> : null}
            {resource.kind === 'link' ? <LinkResource resource={resource} /> : null}
            {isFile ? <DocumentViewer resource={resource} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
