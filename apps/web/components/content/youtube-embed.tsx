import { youTubeEmbedUrl, youTubeThumbnailUrl } from '@ayman/contracts';

/**
 * The URL is BUILT from the stored id, here, at render time. It is never
 * read as a URL from the database and never echoed from a request, so there
 * is no value a user could have supplied that ends up in `src`.
 *
 * `youtube-nocookie.com` is the single entry in the CSP's `frame-src`, and
 * `i.ytimg.com` the only remote host in `img-src`.
 */
export function YouTubeEmbed({ externalId, title }: { externalId: string; title: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-line">
      {/* 16:9 without a wrapper hack, and the box is reserved before load so
          CLS stays at 0. */}
      <div className="aspect-video">
        <iframe
          className="h-full w-full"
          src={youTubeEmbedUrl(externalId)}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {/* The poster is what the browser can prefetch before the iframe resolves. */}
      <link rel="preload" as="image" href={youTubeThumbnailUrl(externalId)} />
    </div>
  );
}
