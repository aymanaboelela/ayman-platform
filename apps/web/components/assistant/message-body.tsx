'use client';

import { Fragment } from 'react';
import { recordWhatsappOpened } from '@/lib/whatsapp-opened';

/**
 * A chat message's text, with any link in it actually pressable.
 *
 * ## The bug this exists for
 *
 * «رسايل م. أيمن» sends an invitation whose entire payload is a URL — «لينك
 * القناة: https://…» — and the bubble rendered `{message.body}` as ONE TEXT
 * NODE. The link was not a link. A student had to select the text, copy it,
 * switch apps and paste, which nobody does, so the one message whose only job
 * was to move someone somewhere could not move anyone anywhere.
 *
 * ## Still no HTML sink, and that is the whole safety argument
 *
 * `conversation_messages.body` is plain text and there is no sanitiser
 * anywhere on this path — the ABSENCE of an HTML sink is the control, as the
 * contract's own header says. This does not add one: it splits a string on a
 * regex and returns React ELEMENTS. Text goes into text nodes exactly as
 * before, and an `<a href>` is built from a matched substring that has already
 * been proven to start with `http://` or `https://` by the pattern that found
 * it. `javascript:` cannot match. Nothing is ever parsed as markup.
 *
 * ## Trailing punctuation is not part of the URL
 *
 * «اللينك: https://chat.whatsapp.com/x.» — the full stop belongs to the
 * sentence, and swallowing it produces a 404 that looks like a broken channel.
 * Arabic commas and the closing halves of quote pairs are trimmed for the same
 * reason. A trailing `)` is only trimmed when the URL has no `(` in it, so a
 * Wikipedia-style link survives.
 */

/**
 * Deliberately narrow: an explicit scheme, then anything that is not
 * whitespace or a bracket. Bare `www.` is NOT matched — the composer never
 * writes one, and guessing a scheme for text a student typed is how a
 * conversation turns into a link nobody meant to publish.
 */
const URL_PATTERN = /https?:\/\/[^\s<>()[\]{}"'«»]+[^\s<>()[\]{}"'«».,؛،:!?]/g;

/** WhatsApp's own hosts. Pressing one of these answers the invitation. */
const WHATSAPP_HOSTS = new Set(['chat.whatsapp.com', 'wa.me', 'whatsapp.com', 'www.whatsapp.com']);

export function MessageBody({ body, className }: { body: string; className?: string }) {
  return <span className={className}>{linkify(body)}</span>;
}

function linkify(body: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
    const href = match[0];
    const start = match.index;

    if (start > cursor) parts.push(body.slice(cursor, start));
    parts.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        // `noreferrer` as well as `noopener`: the destination is a third party
        // and has no business learning which page of the platform sent them.
        rel="noreferrer noopener"
        onClick={isWhatsapp(href) ? recordWhatsappOpened : undefined}
        className="underline underline-offset-2 hover:no-underline"
        // The URL reads left-to-right inside a right-to-left sentence. Without
        // this the punctuation around it lands on the wrong side and the whole
        // line looks scrambled — the bidi failure `stream-badge` documents.
        dir="ltr"
      >
        {href}
      </a>,
    );
    cursor = start + href.length;
  }

  if (cursor < body.length) parts.push(body.slice(cursor));
  // A body with no link at all comes back as the original single string, so
  // the common case allocates nothing and renders exactly as it used to.
  return parts.length > 0 ? parts.map((part, index) => <Fragment key={index}>{part}</Fragment>) : [body];
}

function isWhatsapp(href: string): boolean {
  try {
    return WHATSAPP_HOSTS.has(new URL(href).hostname.toLowerCase());
  } catch {
    // `URL` threw on something the regex accepted. It is still rendered as a
    // link — the browser is the authority on what it can open — but it is not
    // treated as the invitation being answered.
    return false;
  }
}
