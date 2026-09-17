import type { ReactNode } from 'react';
import { CardArt, type CardArtName } from './card-art';

/**
 * Card chrome for a block that lives in the dashboard's aside column but was
 * written as a plain full-width `<section>`.
 *
 * ## Why it exists rather than a `variant` prop on each block
 *
 * «إنجازاتك» and «نصيحة اليوم» got real `variant="aside"` forms, because both
 * genuinely change shape in a 23rem column — one repins its badge grid to three
 * columns, the other gained a heading it never had. «ذاكر ده» and «امتحانات في
 * انتظارك» do not: their rows are already a vertical list at any width, and the
 * only thing they were missing beside three bordered, illustrated cards was the
 * border and the illustration. A `variant` prop on each would be two more
 * branches maintaining one rule.
 *
 * Without it the column read as three finished cards followed by two runs of
 * loose text — which is the exact "unfinished" impression this whole pass is
 * answering.
 *
 * `art` is optional on purpose. «امتحانات في انتظارك» renders only when
 * something is actually waiting, and a banner over an alert makes it look like
 * standing furniture; «ذاكر ده» is permanent and takes the magnifier scene.
 */
export function AsideBlock({ art, children }: { art?: CardArtName; children: ReactNode }) {
  return (
    <div className="aside-card">
      {art ? <CardArt name={art} /> : null}
      <div className="aside-card__body">{children}</div>
    </div>
  );
}
