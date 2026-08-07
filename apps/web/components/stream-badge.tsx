import { copy } from '@ayman/contracts';

const c = copy.stream;

/**
 * مدارس عام / مدارس لغات, as one chip per stream.
 *
 * ## One chip each, not a single "عام ولغات" pill
 *
 * The compact label reads fine on a card and badly everywhere it matters: a
 * visitor scanning for their own stream is looking for ONE word, and a merged
 * label makes them parse a sentence to find out whether they are included.
 * Two chips means «عام» is always the same chip in the same place whether or
 * not لغات is next to it. `c.stream.both` still exists for prose.
 *
 * ## Why it lives at the top of `components/`, not under `site/` or `admin/`
 *
 * The same two words label the checkbox the teacher ticks and the badge a
 * stranger reads. Rendering them from one component is what stops the admin
 * and the public page from ever describing the same course differently.
 * `globals.css` is imported by the ROOT layout, so `.stream-chip` resolves on
 * the marketing site, in the dashboard and in the admin alike — unlike
 * `--site-*`, which only exists under `(site)`.
 *
 * ## Colour
 *
 * Ember tint for لغات, plain surface for عام. Deliberately NOT `--a-*`: amber
 * is the ACTION colour in this system, and a passive label wearing it reads as
 * something you can press. Both tokens invert correctly in dark mode
 * (`--e-tint` → `--e-950`, `--e-ink` → `--e-300`).
 */
export function StreamBadge({
  forGeneral,
  forLanguages,
  className,
}: {
  forGeneral: boolean;
  forLanguages: boolean;
  className?: string;
}) {
  // The database CHECK makes "neither" unrepresentable, so there is no empty
  // state to design — but a stale cached payload from before the migration
  // would render two silent chips, and rendering nothing is the honest answer.
  if (!forGeneral && !forLanguages) return null;

  return (
    <span className={className ? `stream-chips ${className}` : 'stream-chips'}>
      {forGeneral ? <span className="stream-chip">{c.general}</span> : null}
      {forLanguages ? (
        <span className="stream-chip stream-chip--languages">{c.languages}</span>
      ) : null}
    </span>
  );
}
