import { youTubeEmbedUrl } from '@ayman/contracts';

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
      {/*
        There is deliberately NO `<link rel="preload" as="image">` for the
        poster here.

        It looks like it should help and it cannot: the thumbnail is fetched by
        the YouTube document INSIDE the iframe, which is a separate, cross-origin
        browsing context with its own cache partition. A preload issued by THIS
        document can only ever be consumed by this document. Nothing here renders
        the thumbnail, so the entry was fetched, parked, and then dropped
        unused — one wasted image download per embed, plus Chrome's "was
        preloaded using link preload but not used within a few seconds from the
        window's load event" warning per embed, which is what buried the console
        on any page carrying more than a couple of lessons.
      */}
    </div>
  );
}
