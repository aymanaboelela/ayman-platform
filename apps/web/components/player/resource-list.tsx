import { copy, type PlayerResource } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
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

function VideoResource({ resource }: { resource: PlayerResource }) {
  if (resource.youtubeId === null) return null;
  return (
    <div className="aspect-video overflow-hidden rounded-md border border-line">
      <iframe
        // Rebuilt from the stored 11-character id. A stored URL here would
        // reintroduce the SSRF class the extractor exists to eliminate.
        src={`https://www.youtube-nocookie.com/embed/${resource.youtubeId}`}
        title={resource.title}
        className="block h-full w-full border-0"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function LinkResource({ resource }: { resource: PlayerResource }) {
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
