/**
 * A percentage drawn as an arc.
 *
 * The geometry is fixed at a 100-unit viewBox with a radius of 42, so one
 * constant is enough: the circumference. Everything else is `stroke-dasharray`.
 * Sizing is left entirely to `.dial` in CSS — the SVG scales — so a caller
 * never passes pixels and two of these can never be drawn at two stroke weights.
 *
 * ⚠️ The CSS class is `.dial`, not `.ring`, and the mismatch with this
 * component's name is deliberate: Tailwind ships `ring` as a utility
 * (`box-shadow: 0 0 0 1px currentColor`), so `className="ring"` picked it up and
 * drew a 1px square around the arc on the live page. See the block in
 * `study.css` for the full note.
 *
 * ## Why `role="img"` with a label rather than `role="progressbar"`
 *
 * `progressbar` promises an updating value, and screen readers treat it as live
 * in some modes. This is a static figure rendered once per page load. An image
 * with a name is the honest mapping, and the name is the figure in words, so
 * nothing depends on reading the arc.
 */
export function ProgressRing({
  percent,
  label,
}: {
  /** 0–100. Clamped here rather than at the call site: a `numeric` column can
   *  legitimately arrive at 100.00000000000001 and a dash offset below zero
   *  draws the arc backwards. */
  percent: number;
  /** The accessible name — already formatted, e.g. «إجمالي تقدّمك ٤٢٪». */
  label: string;
}) {
  const value = Math.min(Math.max(percent, 0), 100);
  const circumference = 2 * Math.PI * 42;

  return (
    <span className="dial-wrap">
      <svg className="dial" viewBox="0 0 100 100" role="img" aria-label={label}>
        <circle className="dial__track" cx="50" cy="50" r="42" />
        {/* Nothing is drawn at 0 rather than a round cap sitting alone at 12
            o'clock, which reads as a small amount of progress rather than as
            none. */}
        {value > 0 ? (
          <circle
            className="dial__arc"
            cx="50"
            cy="50"
            r="42"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
          />
        ) : null}
      </svg>
      {/* `aria-hidden`: the SVG's label above already states this number. */}
      <span className="dial__value" aria-hidden="true">
        {Math.round(value)}%
      </span>
    </span>
  );
}
