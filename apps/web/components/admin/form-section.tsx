import type { ReactNode } from 'react';

/**
 * One numbered block of a long admin form.
 *
 * The styling lives in `admin.css` (`.form-card`) — this file only fixes the
 * SHAPE: a number, a title, one sentence of purpose, an optional chip at the
 * far end, and the fields. Every admin form that is longer than a screen gets
 * the same object, so «التسعير» looks the same on a course as it does on a
 * book and an instructor learns the page once.
 *
 * `index` is passed in rather than counted from the children's order. The
 * blocks are conditional on some screens (a year-1 course has no track), and a
 * number that renumbers itself when a block disappears is worse than no number
 * at all — the point of it is that it stays the same between visits.
 *
 * ## `wide`
 *
 * On a large screen `.form-stack` lays these out in TWO columns — the editor
 * was one 68rem ribbon pinned to the right edge with the whole left half of a
 * desktop empty. A block whose fields do not survive half a column (a long
 * textarea, a table, a media picker) opts out with `wide` and spans both.
 *
 * In RTL a two-column grid reads right-to-left then down, so the numbered
 * order the instructor follows is unchanged: 1 top-right, 2 top-left, 3 below
 * on the right. Nothing is reordered and no field moves.
 */
export function FormSection({
  index,
  title,
  note,
  aside,
  wide = false,
  children,
}: {
  index: number;
  title: string;
  note?: string;
  /** A badge or count that belongs to the block, not to a field in it. */
  aside?: ReactNode;
  /** Span both columns on a wide screen — see the doc above. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`panel form-card${wide ? ' form-card--wide' : ''}`}>
      <header className="form-card__head">
        {/* `aria-hidden`: the number is an ordinal for the eye. A screen
            reader that announced "4" before «التسعير» would be reading out
            the page's layout, not its content — the heading below already
            carries the name, and the reading order already carries the
            order. */}
        <span className="form-card__num" aria-hidden="true">
          {index}
        </span>
        <div className="min-w-0">
          <h2 className="form-card__title">{title}</h2>
          {note ? <p className="form-card__note">{note}</p> : null}
        </div>
        {aside ? <div className="form-card__aside">{aside}</div> : null}
      </header>
      <div className="form-card__body">{children}</div>
    </section>
  );
}

/**
 * «١٤٨/٥٠٠» under a length-capped field.
 *
 * Turns amber only in the last tenth: a counter that is loud from the first
 * character trains you to ignore it, and the one moment it has to be read is
 * the moment the next keystroke will be dropped by `maxLength`.
 */
export function FieldCount({ value, max }: { value: string; max: number }) {
  const near = value.length >= max * 0.9;
  return (
    <p className={`field-count mt-1 text-end${near ? ' field-count--near' : ''}`} dir="ltr">
      {value.length}/{max}
    </p>
  );
}
