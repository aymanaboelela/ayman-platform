'use client';

import { Fragment } from 'react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import { recordWhatsappOpened } from '@/lib/whatsapp-opened';

/**
 * A chat message's text, with any link in it actually pressable — and a
 * WhatsApp link rendered as the green card it deserves.
 *
 * ## Two bugs, one component
 *
 * The FIRST was that the bubble rendered `{message.body}` as one text node, so
 * the invitation — whose entire payload is a URL — contained a link that was
 * not a link. Nobody selects, copies, switches app and pastes.
 *
 * The SECOND survived that fix and was worse to look at: a linkified URL is
 * still 55 unbreakable characters, and a chat bubble is about 280px wide on a
 * phone. It ran off the side of the panel — «داخل في الشاشة» — and the part
 * you could reach was the middle of an address. So a line that is NOTHING BUT
 * a WhatsApp URL is no longer rendered as text at all: it becomes a card with
 * the WhatsApp mark on it, the whole thing one target, and no address on
 * screen to overflow anything.
 *
 * ## Still no HTML sink, and that remains the safety argument
 *
 * `conversation_messages.body` is plain text and there is no sanitiser
 * anywhere on this path — the ABSENCE of an HTML sink is the control. This
 * does not add one: it splits a string on a regex and returns React ELEMENTS.
 * Text goes into text nodes exactly as before, and every `href` is a substring
 * the pattern has already proven starts with `http://` or `https://`, so
 * `javascript:` cannot match. Nothing is ever parsed as markup.
 */

/**
 * Deliberately narrow: an explicit scheme, then anything that is not
 * whitespace or a bracket. Bare `www.` is NOT matched — the composer never
 * writes one, and guessing a scheme for text a student typed is how a
 * conversation turns into a link nobody meant to publish.
 */
const URL_PATTERN = /https?:\/\/[^\s<>()[\]{}"'«»]+[^\s<>()[\]{}"'«».,؛،:!?]/g;

/** WhatsApp's own hosts. A link to one of these gets the card. */
const WHATSAPP_HOSTS = new Set(['chat.whatsapp.com', 'wa.me', 'whatsapp.com', 'www.whatsapp.com']);

export function MessageBody({ body, className }: { body: string; className?: string }) {
  /*
   * LINE BY LINE, because the card is a line-level decision.
   *
   * A line holding only a WhatsApp URL is replaced by the card; everything
   * else is linkified inline as before. Splitting here rather than inside
   * `linkify` is what keeps that rule simple enough to state in one sentence —
   * and `WHATSAPP_LINK_LINE` is `'{url}'` precisely so the composer produces
   * such a line.
   */
  const lines = body.split('\n');

  return (
    <span className={className}>
      {lines.map((line, index) => {
        const card = whatsappCardFor(line);
        return (
          <Fragment key={index}>
            {index > 0 ? '\n' : null}
            {card ? <WhatsappCard href={card} /> : linkify(line)}
          </Fragment>
        );
      })}
    </span>
  );
}

/**
 * «قناة الواتساب» as a pressable card, the way the app itself would draw it.
 *
 * Green, the WhatsApp mark, a label and an arrow — and the WHOLE card is the
 * anchor, so the icon and the words both land on the link rather than only a
 * run of blue text in the middle of a sentence. `break-words` is belt and
 * braces: nothing here renders the address, but a future label in a narrow
 * bubble must still wrap rather than push the panel sideways.
 */
function WhatsappCard({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      // `noreferrer` as well as `noopener`: WhatsApp has no business learning
      // which page of the platform sent them.
      rel="noreferrer noopener"
      onClick={recordWhatsappOpened}
      className={cn(
        'my-1 flex w-full max-w-[18rem] items-center gap-2.5 rounded-[var(--r-md)] p-2.5',
        'text-start no-underline transition-opacity duration-[160ms] ease-out hover:opacity-90',
      )}
      style={
        {
          // Fixed brand colours in BOTH themes, so the ink on them has to be
          // fixed too — the exact reasoning `WhatsappChannelCard` carries.
          background: SOCIAL_MARKS.whatsapp.hex,
          '--wa-ink': '#0A2E1C',
        } as React.CSSProperties
      }
    >
      {/* White on the green is WhatsApp's own logotype, which WCAG exempts
          from contrast. The TEXT beside it does not get that exemption and is
          dark — the same two-inks split the dashboard card documents. */}
      <span aria-hidden="true" className="shrink-0 text-white">
        <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={20} />
      </span>
      <span className="min-w-0 flex-1 break-words text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--wa-ink)]">
        {copy.assistant.thread.whatsappCard}
      </span>
    </a>
  );
}

/** The URL when `line` is nothing but a WhatsApp link, else `null`. */
function whatsappCardFor(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  // `matchAll` rather than `test`: the pattern is `/g` and carries `lastIndex`
  // between calls, which makes `test` alternate true/false on identical input.
  const matches = [...trimmed.matchAll(URL_PATTERN)];
  if (matches.length !== 1) return null;

  const href = matches[0]![0];
  return href === trimmed && isWhatsapp(href) ? href : null;
}

function linkify(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of line.matchAll(URL_PATTERN)) {
    const href = match[0];
    const start = match.index;

    if (start > cursor) parts.push(line.slice(cursor, start));
    parts.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={isWhatsapp(href) ? recordWhatsappOpened : undefined}
        // `break-all`: a URL has no break opportunities of its own, so without
        // this one inline address makes the whole bubble wider than the panel.
        className="break-all underline underline-offset-2 hover:no-underline"
        // The URL reads left-to-right inside a right-to-left sentence. Without
        // this the punctuation around it lands on the wrong side.
        dir="ltr"
      >
        {href}
      </a>,
    );
    cursor = start + href.length;
  }

  if (cursor < line.length) parts.push(line.slice(cursor));
  // A line with no link comes back as the original string, so the common case
  // allocates nothing and renders exactly as it used to.
  return parts.length > 0 ? parts.map((part, index) => <Fragment key={index}>{part}</Fragment>) : [line];
}

function isWhatsapp(href: string): boolean {
  try {
    return WHATSAPP_HOSTS.has(new URL(href).hostname.toLowerCase());
  } catch {
    // `URL` threw on something the regex accepted. It is still rendered as a
    // link — the browser is the authority on what it can open — but it gets no
    // card and does not count as the invitation being answered.
    return false;
  }
}
