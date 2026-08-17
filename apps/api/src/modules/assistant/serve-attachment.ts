import type { Response } from 'express';
import type { AttachmentStream } from './conversation-attachment.service';

/**
 * The response for a conversation attachment, written once for both sides.
 *
 * Every header here is copied from `PlayerController.serveResource`, which is
 * the other place this product streams gated bytes, and each one is load-bearing
 * rather than ceremonial:
 *
 *   · **Content-Type** is OUR detected mime, read back off the storage key —
 *     never anything the uploader declared;
 *   · **nosniff** stops a browser second-guessing that;
 *   · **RFC 5987 filename\*** because these names are Arabic more often than
 *     not, and a raw non-ASCII byte in a header is a malformed response rather
 *     than a filename;
 *   · **private, no-store** because a shared-machine browser cache holding one
 *     student's conversation outlives the session that was allowed to read it;
 *   · **`default-src 'none'; sandbox`** is what makes framing a PDF on our own
 *     origin safe — a unique opaque origin with no script execution, whatever
 *     the file turns out to contain.
 *
 * ## One route with `?download=1`, where the player has two
 *
 * `PlayerResourceSchema` ships `viewPath` and `downloadPath` as separately
 * built strings because the lesson payload is assembled server-side for a
 * component that renders both an iframe and a link. Here the two paths differ
 * by one query parameter, and the alternative — a second route per side — is
 * four routes, four sets of `ParseUUIDPipe`s and twelve rows in the
 * authorization matrix to express one boolean. The disposition is the only
 * thing that changes; everything else is byte-identical.
 *
 * The parameter is read as PRESENCE, not as a value: `?download=1`,
 * `?download=yes` and `?download=` all mean the same thing, and nothing else
 * about the response depends on it.
 */
export function sendAttachment(
  file: AttachmentStream,
  download: string | undefined,
  response: Response,
): void {
  const disposition = download === undefined ? 'inline' : 'attachment';

  response.set({
    'Content-Type': file.mime,
    'Content-Length': String(file.size),
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });

  // Piped, not buffered: a 90 MB deck must not become 90 MB of resident memory
  // on a small VPS for the duration of a slow phone connection.
  file.stream.pipe(response);
}
