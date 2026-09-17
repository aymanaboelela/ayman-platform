'use client';

import { ArrowLeft, GraduationCap } from 'lucide-react';
import { Fragment } from 'react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import { recordWhatsappOpened } from '@/lib/whatsapp-opened';

const c = copy.assistant.thread.whatsappCard;
const cc = copy.assistant.thread.courseCard;

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

/** The public course catalog, and a course page under it. */
const COURSE_PATH = /^\/courses(\/|$)/u;

export function MessageBody({
  body,
  className,
  trusted = false,
}: {
  body: string;
  className?: string;
  /**
   * This body was written by the platform or by an admin, not typed by a
   * visitor.
   *
   * ⚠️ The ONLY gate on the course card, and it is not decoration. That card
   * says «الكورس بتاعك» over a link, which is a sentence the platform is
   * vouching for — drawn around an address a student pasted into their own
   * message it would be the platform endorsing a stranger's link. The card
   * navigates to the PATH only (see `CourseCard`), so the worst case was
   * always cosmetic rather than a redirect; this keeps it from being even
   * that. Defaults to `false` so a new call site is safe by omission.
   */
  trusted?: boolean;
}) {
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
        const course = card === null && trusted ? courseCardFor(line) : null;
        return (
          <Fragment key={index}>
            {index > 0 ? '\n' : null}
            {card ? (
              <WhatsappCard href={card} />
            ) : course ? (
              <CourseCard path={course} />
            ) : (
              linkify(line)
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

/**
 * «قناة الواتساب» as a pressable card, the way the app itself would draw it.
 *
 * ## Why it is no longer a green slab
 *
 * It used to be one rectangle of `#25D366` with a line of text on it, dropped
 * inside a bubble that is already a rectangle of brand amber — «بجد وحشة».
 * Two fully saturated colours meeting along an edge is the whole problem: they
 * vibrate, neither one gets to be the loud thing, and the card reads as a
 * mis-pasted swatch rather than as something to press.
 *
 * So the card is a LIGHT card now, the way WhatsApp draws a link preview
 * inside its own bubbles: a warm-white sheet, the mark in a green disc, the
 * channel named on one line and described on the next, and the green spent
 * where it does the work — one full-width button that says what the press
 * does. The colour is still WhatsApp's; it is just no longer the background.
 *
 * ## Every colour here is a literal, and that is deliberate
 *
 * The bubble it sits in is `bg-accent` with `#1A1206` ink — a colour that is
 * fixed in BOTH themes and, worse, ADMIN-SETTABLE (`ACCENT_RAMPS`). A card
 * built from theme tokens would follow the theme while the surface under it
 * followed the brand, and would go dark-on-dark the first time an admin picked
 * something the palette had not anticipated. A near-white sheet is legible on
 * every ramp in that table. `--wa-title` is the bubble's own ink, so the card
 * reads as part of the message rather than as a widget that landed on it.
 *
 * The focus ring is local for the same reason: the global one is `--a-9`,
 * which is the accent — an amber ring on an amber bubble is no ring at all.
 *
 * `break-words` is belt and braces: nothing here renders the address, but a
 * label in a narrow bubble must wrap rather than push the panel sideways.
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
        'group my-1.5 flex w-full max-w-[17.5rem] flex-col gap-2.5 rounded-[14px] p-2.5',
        'border border-[color:var(--wa-line)] bg-[color:var(--wa-sheet)] text-start no-underline',
        'shadow-[0_1px_2px_rgb(26_18_6_/_0.16)]',
        'transition-transform duration-[140ms] ease-out active:translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wa-title)]',
      )}
      style={
        {
          '--wa': SOCIAL_MARKS.whatsapp.hex,
          // The pressed/hovered green. One step deeper rather than an opacity
          // change, which on a light sheet reads as the button fading out.
          '--wa-deep': '#1BB755',
          /*
           * The ink for text ON the green. Measured against `#25D366`:
           * 7.45:1, so it clears AAA — white would be 1.98:1, less than half
           * of what WCAG asks of text, which is the trap the dashboard card
           * documents falling into.
           */
          '--wa-ink': '#0A2E1C',
          '--wa-sheet': '#FFFDF8',
          '--wa-line': 'rgb(26 18 6 / 0.10)',
          '--wa-title': '#1A1206',
          '--wa-lead': '#5B5147',
        } as React.CSSProperties
      }
    >
      <span className="flex items-center gap-2.5">
        {/* White on the green is WhatsApp's own logotype, which WCAG exempts
            from contrast entirely and which is wrong in any other colours. */}
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--wa)] text-white"
        >
          <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={19} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block break-words text-[length:var(--fs-text-sm)] font-semibold leading-tight text-[color:var(--wa-title)]">
            {c.title}
          </span>
          <span className="mt-1 block break-words text-[length:var(--fs-text-xs)] leading-tight text-[color:var(--wa-lead)]">
            {c.lead}
          </span>
        </span>
      </span>

      {/*
        A real button, full width, and the reason the closer of every
        invitation can now say «الزرار الأخضر اللي فوق» — a message that tells
        someone to press something has to be pointing at a shape they can
        find. It is a `<span>`: the whole card is already the anchor, and a
        button inside a link is a control nothing can operate.
      */}
      <span className="flex items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--wa)] px-3 py-2 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--wa-ink)] transition-colors duration-[140ms] ease-out group-hover:bg-[color:var(--wa-deep)]">
        {c.action}
        <ArrowLeft className="size-4" aria-hidden="true" />
      </span>
    </a>
  );
}

/**
 * «الكورس بتاعك» — the same card shape, for the one link that goes INWARDS.
 *
 * ## Why it is not the WhatsApp card with a different colour
 *
 * Because it does a different thing and must not be mistaken for the one the
 * student has already learned to read as "this leaves the app". That one is
 * green, opens a new tab, and ends a conversation; this one is the platform's
 * own accent, stays on the site, and is the first step of one.
 *
 * ## Why a plain `<a>` and not a soft navigation
 *
 * This card is rendered inside المساعد's panel, which is an overlay with a
 * scroll lock on the document. A client-side navigation would leave the panel
 * mounted over the course page, or unmount it mid-transition and leave the
 * lock behind — the exact failure mode this codebase has already paid for
 * twice. A real navigation tears all of it down and lands the student on the
 * course page with nothing left over. It costs one page load, on the press
 * that matters least about speed.
 *
 * ## Why the HOST is dropped
 *
 * `path` is the pathname alone, so the card can only ever navigate within this
 * site whatever the stored URL said. Combined with `trusted`, there is no
 * arrangement of message text that makes this card point off-origin.
 */
function CourseCard({ path }: { path: string }) {
  return (
    <a
      href={path}
      className={cn(
        'group my-1.5 flex w-full max-w-[17.5rem] flex-col gap-2.5 rounded-[14px] p-2.5',
        'border border-[color:var(--cc-line)] bg-[color:var(--cc-sheet)] text-start no-underline',
        'shadow-[0_1px_2px_rgb(26_18_6_/_0.16)]',
        'transition-transform duration-[140ms] ease-out active:translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--cc-title)]',
      )}
      style={
        {
          /*
           * Literals, exactly as `WhatsappCard` uses them and for the identical
           * reason spelled out there: the bubble under this card is `bg-accent`
           * with fixed `#1A1206` ink, and the accent ramp is ADMIN-SETTABLE.
           * A card built from theme tokens would follow the theme while the
           * surface it sits on followed the brand, and would go dark-on-dark
           * the first time somebody picks a ramp the palette did not expect.
           *
           * The violet is the platform's own "structure" colour rather than
           * the amber "action" one — on an amber bubble an amber button is
           * invisible, which is the same vibration problem the green slab had.
           * White on `#4F31D8` measures 8.4:1.
           */
          '--cc': '#4F31D8',
          '--cc-deep': '#3F26B4',
          '--cc-ink': '#FFFFFF',
          '--cc-sheet': '#FFFDF8',
          '--cc-line': 'rgb(26 18 6 / 0.10)',
          '--cc-title': '#1A1206',
          '--cc-lead': '#5B5147',
        } as React.CSSProperties
      }
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--cc)] text-[color:var(--cc-ink)]"
        >
          <GraduationCap className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block break-words text-[length:var(--fs-text-sm)] font-semibold leading-tight text-[color:var(--cc-title)]">
            {cc.title}
          </span>
          <span className="mt-1 block break-words text-[length:var(--fs-text-xs)] leading-tight text-[color:var(--cc-lead)]">
            {cc.lead}
          </span>
        </span>
      </span>

      {/* The shape every `SUBSCRIBE_CLOSERS` entry points at — «الزرار اللي
          فوق». A closer that names a button the card does not draw is the bug
          `WHATSAPP_LINK_LINE` documents, one layer up. */}
      <span className="flex items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--cc)] px-3 py-2 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--cc-ink)] transition-colors duration-[140ms] ease-out group-hover:bg-[color:var(--cc-deep)]">
        {cc.action}
        <ArrowLeft className="size-4" aria-hidden="true" />
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

/**
 * The PATHNAME when `line` is nothing but a link to a course page, else `null`.
 *
 * The host is read and thrown away on purpose — see `CourseCard`. What the
 * caller gets back can only ever be a path on this site.
 */
function courseCardFor(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  // `matchAll`, not `test` — the pattern is `/g` and carries `lastIndex`
  // between calls, which makes `test` alternate on identical input.
  const matches = [...trimmed.matchAll(URL_PATTERN)];
  if (matches.length !== 1) return null;

  const href = matches[0]![0];
  if (href !== trimmed) return null;

  try {
    const url = new URL(href);
    if (!COURSE_PATH.test(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
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
