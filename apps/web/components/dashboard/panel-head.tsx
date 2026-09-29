import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The hue a panel is washed in. Each maps to a token in `study.css`
 * (`.panel-head[data-hue]`) — a `--viz-*` step for the category hues, the
 * tenant's own accent for `amber` — so nothing here names a colour.
 *
 * `amber` is for a card that is itself an action waiting («امتحانات في
 * انتظارك»): the page spends amber on "press this" and nowhere else.
 */
export type PanelHue = 'blue' | 'violet' | 'teal' | 'amber';

/**
 * The top of an aside card: a medallion, the heading, one line under it, and
 * a count at the inline end.
 *
 * ## Why this replaced the banner drawings
 *
 * «ذاكر ده»، «إنجازاتك» and «نصيحة اليوم» each opened with a 16/6 SVG scene —
 * on a 390px phone that is ~140px of pale pastel above a heading, three times
 * down one column, and it read as unfinished rather than illustrated
 * («اضبط بقى يا باشا شكلها»). The heading is what a student is looking for,
 * so it now IS the top of the card: a coloured wash behind it, a solid
 * medallion that carries the card's hue at full strength, and the count
 * printed where the eye finishes the line.
 *
 * One component rather than three copies because the three cards sit one
 * under the other, and three headers drawn three slightly different ways is
 * how a column starts to look assembled from parts.
 *
 * `meta` is visible text, not `aria-hidden`: it is the count («2 من 6»), and
 * it is a fact a screen reader should hear right after the heading.
 */
export function PanelHead({
  icon: Icon,
  hue,
  title,
  lead,
  meta,
}: {
  icon: LucideIcon;
  hue: PanelHue;
  title: string;
  lead?: string;
  meta?: ReactNode;
}) {
  return (
    <header className="panel-head" data-hue={hue}>
      <span className="panel-head__icon" aria-hidden="true">
        <Icon className="size-5" strokeWidth={2.25} />
      </span>
      <div className="panel-head__text">
        {/* The count shares the TITLE's line, not the whole header's: beside
            the lead it squeezed the one sentence that explains the card into
            three lines on a phone. It wraps under the title when the two do
            not fit. */}
        <div className="panel-head__top">
          <h2 className="panel-head__title">{title}</h2>
          {meta ? <span className="panel-head__meta">{meta}</span> : null}
        </div>
        {lead ? <p className="panel-head__lead">{lead}</p> : null}
      </div>
    </header>
  );
}
