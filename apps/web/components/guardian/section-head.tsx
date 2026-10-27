import type { ReactNode } from 'react';

/** A section's heading row — a coloured marker, the title, and an optional
 *  aside (a count, a summary) at the inline end. The colour is the section's
 *  `data-tone`, so the marker always matches the block it heads. */
export function SectionHead({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  return (
    <header className="gd-section__head">
      <h2 id={id} className="gd-section__title">
        <span className="gd-section__mark" aria-hidden="true" />
        {title}
      </h2>
      {aside ? <div className="gd-section__aside">{aside}</div> : null}
    </header>
  );
}
