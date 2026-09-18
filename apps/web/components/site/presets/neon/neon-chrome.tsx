import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * «الترمينال»'s shared parts: the bidi-safe mono run, the section head, the
 * code window, the command button, and the aligned meta rows.
 *
 * Every section in this directory is built out of these five, which is what
 * keeps the preset looking like ONE page rather than twelve sections that each
 * invented their own chrome. They are deliberately dumb — no data loading, no
 * state, no client boundary — so a section can be read top to bottom without
 * chasing behaviour into here.
 */

/**
 * A Latin or numeric run, isolated from the Arabic around it.
 *
 * ⚠️ THIS IS NOT DECORATION AND IT IS NOT OPTIONAL.
 *
 * The document is `dir="rtl"`. A bare `// courses` dropped into an RTL
 * paragraph is resolved by the bidi algorithm against the paragraph's
 * direction, and the neutral `/` characters attach to the wrong side: the run
 * renders as `courses //`. The same thing happens to `01`, to `12` next to an
 * Arabic word, to `./courses`, and to a price with a grouping separator in it
 * — and it happens SILENTLY, because every character is present and correct,
 * just in the wrong order. It has bitten this repo before, which is why
 * `.site-badge` in `theme.css` carries its own `direction: ltr` and why every
 * mono run on this page goes through this component instead of remembering.
 *
 * `dir="ltr"` on the element plus `unicode-bidi: isolate` in the stylesheet:
 * the attribute sets the run's own direction, the isolation stops it from
 * changing how the Arabic on either side of it is ordered.
 */
export function Mono({
  children,
  className,
  hidden = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * `aria-hidden`, for a marker that is pure ornament — `// courses` sitting
   * directly above an Arabic `<h2>` that says the same thing in words. A
   * screen reader that read both would announce the section twice, once as
   * punctuation.
   */
  hidden?: boolean;
}) {
  return (
    <span
      dir="ltr"
      className={className ? `neon-mono ${className}` : 'neon-mono'}
      aria-hidden={hidden || undefined}
    >
      {children}
    </span>
  );
}

/**
 * The head every section shares: a marker that reads like a code comment, the
 * Arabic heading, and an optional lead.
 *
 * `level` exists because exactly one element on this page may be an `<h1>` and
 * WHICH element that is depends on the tenant's block list — see the long note
 * in `<NeonLanding>`. A section cannot decide it for itself, so it is told.
 */
export function NeonHead({
  marker,
  title,
  lead,
  level = 2,
  align = 'start',
}: {
  /** Written without the `//`; this adds it. */
  marker: string;
  title?: string;
  lead?: string;
  level?: 1 | 2;
  align?: 'start' | 'center';
}) {
  const Heading = level === 1 ? 'h1' : 'h2';

  return (
    <header className="neon-head" data-align={align}>
      <p className="neon-marker">
        <Mono hidden>{`// ${marker}`}</Mono>
      </p>
      {title ? <Heading className="neon-h">{title}</Heading> : null}
      {lead ? <p className="neon-lead">{lead}</p> : null}
    </header>
  );
}

/**
 * A CODE WINDOW — the one card shape this preset has.
 *
 * Title bar with three dots and a filename on the inline start, content below.
 * The filename is real: a course window is named after the course's slug, the
 * about window after what it is. That is the difference between a window that
 * carries information and a window that is a sticker of one.
 *
 * `lit` raises the border to the brand colour with a glow behind it. It is
 * opt-in rather than a hover effect because the pages that need it — the
 * hero's own panel, the closing CTA — need it at rest.
 */
export function NeonWindow({
  file,
  children,
  lit = false,
  className,
}: {
  file: string;
  children: ReactNode;
  lit?: boolean;
  className?: string;
}) {
  return (
    <div
      className={className ? `neon-win ${className}` : 'neon-win'}
      data-lit={lit ? 'true' : undefined}
    >
      <div className="neon-win__bar">
        {/* Three dots and a filename. Both are chrome: the dots say "window"
            and the filename repeats, in Latin, something the content below
            already states in Arabic. Announcing either would add noise to
            every single card on the page. */}
        <span className="neon-win__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <Mono className="neon-win__file" hidden>
          {file}
        </Mono>
      </div>
      <div className="neon-win__body">{children}</div>
    </div>
  );
}

/**
 * A link that reads like a command.
 *
 * `run` is the primary: a filled gradient with a glow, wrapped in brackets.
 * `path` is the secondary: an outline with a `./` prefix and corner ticks.
 *
 * ## Why the brackets and the `./` are real elements and not `::before`
 *
 * They are `aria-hidden` spans. CSS `content` IS exposed to the accessibility
 * tree by every current engine, so a `::before { content: '[' }` would have a
 * screen reader announce «bracket ابدأ دلوقتي bracket» — and `./` is read as
 * "dot slash", which on the one button a visitor is meant to press is worse
 * than noise. An element can be hidden from the tree; generated content
 * cannot. The accessible name of these links is therefore exactly the Arabic
 * label, which is also what a voice-control user has to say out loud to
 * activate it.
 *
 * ## Bracket mirroring is correct here and looks wrong written down
 *
 * The characters are emitted in LOGICAL order — `[` first, `]` last. In an RTL
 * line the bidi algorithm mirrors both glyphs, so the opening bracket is drawn
 * at the inline start (the right) as a `]`-shaped mark and the pair reads
 * correctly around the Arabic. Writing them the other way round to "fix" the
 * preview in an editor is what actually breaks it.
 */
export function NeonCommand({
  href,
  children,
  variant = 'run',
  tabIndex,
}: {
  href: string;
  children: ReactNode;
  variant?: 'run' | 'path';
  /**
   * `-1` for a command that DUPLICATES a link already in the tab order — the
   * one at the foot of a course window, whose title above it points at the
   * same URL. It has to go on the anchor itself: `tabIndex` is not inherited,
   * so putting it on a wrapper leaves the link focusable and a keyboard reader
   * still presses Tab twice per card to get past a grid.
   */
  tabIndex?: number;
}) {
  return (
    <Link className={`neon-cmd neon-cmd--${variant}`} href={href} tabIndex={tabIndex}>
      {variant === 'run' ? (
        <span className="neon-cmd__mark" aria-hidden="true">
          [
        </span>
      ) : (
        <span className="neon-cmd__mark" dir="ltr" aria-hidden="true">
          ./
        </span>
      )}
      <span className="neon-cmd__label">{children}</span>
      {variant === 'run' ? (
        <span className="neon-cmd__mark" aria-hidden="true">
          ]
        </span>
      ) : null}
    </Link>
  );
}

export type MetaRow = {
  /** A Latin key — `lessons`, `price`. See `META` in `./neon-copy.ts`. */
  key: string;
  /** Already formatted by the caller; this renders it and does not parse it. */
  value: string;
  /**
   * The value is ARABIC — «مجاني», a system name — rather than a number.
   *
   * It then renders as plain RTL text instead of going through `<Mono>`.
   * Wrapping Arabic in a `dir="ltr"` isolate is not a harmless belt-and-braces:
   * it flips the order of the words inside it, so «الصف الثاني بكالوريا» comes
   * out as «بكالوريا الثاني الصف». The flag exists because that mistake is
   * invisible to anyone reading the diff in Latin.
   */
  arabic?: boolean;
};

/**
 * The aligned meta block — `lessons ......... 12`.
 *
 * A `<dl>` rather than a table or a row of chips, because that is what these
 * are: a key and its value, several times. Chips were the shape the classic
 * card uses and they are wrong for this preset — a chip is a badge you scan,
 * a dotted leader is a row you READ ACROSS, and the whole point of the
 * monospace treatment is that the values line up down the card.
 *
 * The `<div>` wrapper inside `<dl>` is valid HTML (it is what the spec added
 * grouping for) and is what lets the leader sit between the term and the
 * definition as a flex spacer.
 */
export function NeonMeta({ rows }: { rows: readonly MetaRow[] }) {
  if (rows.length === 0) return null;

  return (
    <dl className="neon-meta">
      {rows.map((row) => (
        <div className="neon-meta__row" key={row.key}>
          <dt className="neon-meta__key">
            <Mono>{row.key}</Mono>
          </dt>
          {/* The dots. Decorative by construction — it is a border, not text —
              and marked so, because a leader that announced itself would put
              "dot dot dot" between every key and its value. */}
          <span className="neon-meta__leader" aria-hidden="true" />
          <dd className="neon-meta__value">
            {row.arabic ? row.value : <Mono>{row.value}</Mono>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
