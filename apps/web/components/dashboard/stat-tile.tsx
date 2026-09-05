import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@ayman/ui';

/**
 * One number and its label. Four of these sit under the dashboard's hero.
 *
 * ## What changed, and why
 *
 * Two rebuilds, and the second is a correction of the first. The original tile
 * opened with a 32px accent-tinted chip behind the icon, and four of them in a
 * row read as four unexplained orange squares competing with the page's real
 * primary action. The fix at the time was to strip the colour out entirely —
 * an `fg-faint` glyph at the tile's inline end — and that traded one problem
 * for the one this whole pass exists to undo: four hairline rectangles with a
 * number in each, indistinguishable from a table.
 *
 * `.tile` (see `study.css`) is the version that resolves both. The icon goes
 * back into a well, so the four tiles have a shape at a glance, but the well is
 * EMBER — structure, a category marker — and therefore does not read as
 * something to press. Exactly one tile on the screen carries `accent`, and it
 * is the one measuring the thing the student is acting on.
 *
 * ## The meter
 *
 * Optional, and supplied only where a fraction is genuinely meaningful —
 * lessons completed, overall progress. It is NOT drawn for "courses enrolled"
 * (a count with no denominator) or "average score" (an average, not a share of
 * anything). A meter under a number that has no whole is a bar the student
 * cannot interpret, and four bars where two are meaningless devalues the two
 * that are. It stays amber for the reason `LessonProgressBar` documents:
 * progress is a position, and position is amber's job.
 *
 * The value is `.tile__value` because these sit in a row and change between
 * renders — the class carries `tabular-nums` so proportional digits cannot make
 * the tiles jitter relative to each other as a student's numbers grow.
 *
 * ## `tone`, and why a stat tile needed one at all
 *
 * The tile grew a second home: the dashboard's ember band, where the three
 * figures now live (see `StatsRow`). `.tile`'s ground is `--n-2`, which is one
 * step off the PAGE in both themes and therefore reads as a surface there and
 * as a smear on ember — and `--n-2` in the dark theme is very nearly the band's
 * own darkest stop, so an unmodified tile on the band is a rectangle you can
 * only find by its hairline. `tone="ink"` swaps the neutral ground, border,
 * number and label for white alphas, exactly as `<ProgressRing tone="ink">`
 * already does for the ring sitting six inches to its left, and for the same
 * stated reason: the band is dark in BOTH themes, so nothing on it may be
 * painted from a ramp that inverts.
 *
 * ## `href`, and why a tile may be pressed
 *
 * Every figure the band prints names something the product has a whole page
 * for. The three inline `<Link>`s that used to state these facts already went
 * there; folding them into the tiles must not throw that away, so the tile
 * renders as an anchor when a destination is given. It is the same object
 * either way — the affordance is the hover and the focus ring, not a chevron.
 */
export function StatTile({
  icon,
  value,
  label,
  note,
  suffix,
  meterPercent,
  accent = false,
  hue,
  tone = 'surface',
  href,
  className,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  /**
   * A second, smaller fact under the label — the raw count the headline number
   * was computed FROM («٤ دروس خلصتها» under an XP score). It exists because
   * the band used to state those raw counts a second time, in a second shape,
   * as its own row of inline links; one tile carrying both is what removed the
   * duplicate rather than the data.
   */
  note?: string;
  suffix?: string;
  /** 0–100. Omit where the number is not a share of a whole. */
  meterPercent?: number;
  /**
   * Swaps the ember well for the amber one. At most ONE tile per screen —
   * the modifier exists to single out the statistic the student is acting on,
   * and two of them single out nothing.
   */
  accent?: boolean;
  /**
   * An OKLCH hue angle for the icon well, from the decorative ramp
   * `lib/subject-art.ts` documents. Ignored when `accent` is set, because the
   * accent well is a stronger claim about the same square and two treatments
   * on one element is a bug rather than a choice.
   *
   * Colours the well and nothing else — see `.tile--hued` in `study.css` for
   * why that is the boundary.
   */
  hue?: number;
  /**
   * Which surface the tile is drawn ON. `surface` is the app's own panels;
   * `ink` is a block that is dark in both themes — today that is only the
   * dashboard's ember band. See the note above, and `ProgressRing`'s identical
   * prop, for why this cannot be left to the neutral ramp.
   */
  tone?: 'surface' | 'ink';
  /** Makes the whole tile an anchor to the screen holding the rest of the
   *  number it prints. Omitted, it stays an inert `<div>` as it always was. */
  href?: string;
  className?: string;
}) {
  const hued = hue !== undefined && !accent;

  const body = (
    <>
      <span className="tile__well" aria-hidden="true">
        {icon}
      </span>

      <div className="tile__body">
        <span className="flex items-baseline gap-1">
          <span className="tile__value">{value}</span>
          {/* `.tile__suffix` rather than the utilities it used to carry
              (`text-[length:var(--fs-text-sm)] text-fg-muted`, which resolve to
              exactly what the class declares). It had to become a class the day
              a tile started rendering on the dashboard's ember band: `fg-muted`
              is `--n-11`, a neutral, and every neutral in this product inverts
              between themes while that band does not. */}
          {suffix ? <span className="tile__suffix">{suffix}</span> : null}
        </span>

        <span className="tile__label">{label}</span>

        {note ? <span className="tile__note">{note}</span> : null}

        {meterPercent === undefined ? null : (
          // Decorative: the number above IS the value, stated in text. A
          // `progressbar` role here would announce the same figure a second
          // time with no extra meaning.
          <span
            className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-surface-4"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-accent"
              style={{ inlineSize: `${Math.min(Math.max(meterPercent, 0), 100)}%` }}
            />
          </span>
        )}
      </div>
    </>
  );

  const classes = cn(
    'tile',
    tone === 'ink' && 'tile--ink',
    accent && 'tile--accent',
    hued && 'tile--hued',
    href && 'tile--link',
    className,
  );
  const style = hued ? ({ '--tile-h': hue } as React.CSSProperties) : undefined;

  // Two returns rather than a `const Root = href ? Link : 'div'` indirection:
  // `next/link` and an intrinsic element do not share a props type, and the
  // cast that reconciles them buys nothing a reader of this file wants.
  return href ? (
    <Link href={href} className={classes} style={style}>
      {body}
    </Link>
  ) : (
    <div className={classes} style={style}>
      {body}
    </div>
  );
}
