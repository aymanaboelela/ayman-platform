import type { IncomingMessage, ServerResponse } from 'node:http';

interface RequestWithBody extends IncomingMessage {
  body?: unknown;
}

/**
 * Lets the ingest route accept the notification as a plain-text body.
 *
 * The poster is a notification-listener macro on an Android handset, not
 * software anyone can debug. Asking it to build JSON means interpolating a
 * notification's text into `{"text": "…"}` by hand, with no escaping — and the
 * day a notification contains a quotation mark or a line break, the request
 * becomes malformed JSON, the API answers 400, and the failure looks from the
 * outside exactly like "the money never arrived". Nobody would find that for
 * weeks.
 *
 * So `text/plain` is accepted, and the body IS the text. There is nothing to
 * escape and nothing to get wrong. `application/json` still works untouched —
 * this only fires on the one content type, and rewrites the body into the same
 * `{ text }` shape the Zod DTO already validates.
 *
 * Hand-rolled against Node's own `http` types rather than importing express's
 * `text()` middleware, for the reason `cspReportBodyParser` documents next
 * door: express is only a transitive dependency here and this repo's strict
 * pnpm layout does not resolve phantom imports.
 */
export function transfersIngestBodyParser(
  req: RequestWithBody,
  _res: ServerResponse,
  next: () => void,
): void {
  const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
  if (contentType !== 'text/plain') {
    next();
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = false;

  req.on('data', (chunk: Buffer) => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_BYTES) {
      // Left undefined rather than truncated: half a capture would be parsed
      // as if it were whole, and the missing half would be money nobody is
      // ever told about. The DTO's own `min(1)` turns this into a 400.
      aborted = true;
      req.body = undefined;
      next();
    } else {
      chunks.push(chunk);
    }
  });

  req.on('end', () => {
    if (aborted) return;
    const raw = Buffer.concat(chunks).toString('utf8');
    req.body = raw.length > 0 ? { text: raw } : undefined;
    next();
  });
}

/** Comfortably more than a full notification list, and far less than anything
 *  worth streaming. Mirrors `IngestTransfersSchema`'s own 20,000-character
 *  ceiling, in bytes — Arabic is multi-byte, so this is the looser of the two
 *  and the schema still has the final say. */
const MAX_BYTES = 64 * 1024;
