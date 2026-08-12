'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';

const c = copy.stream;

type Choice = 'all' | 'general' | 'languages';

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'all', label: c.filterAll },
  { value: 'general', label: c.general },
  { value: 'languages', label: c.languages },
];

/**
 * «اعرض لـ» — narrow the catalogue to عام or لغات.
 *
 * ## It filters with CSS, not by re-rendering a list
 *
 * The grid is server-rendered and this page prerenders at build time. Holding
 * the courses in client state to `.filter()` them would mean shipping the
 * catalogue twice — once as HTML and again as props — and turning a static
 * page dynamic to read a query string. Instead every card carries
 * `data-general` / `data-languages`, this sets one attribute on the container,
 * and a single CSS rule hides the rest.
 *
 * So every course stays in the HTML a crawler sees regardless of the filter,
 * and switching is instant with no network and no re-render of the grid.
 *
 * ## Why not `?stream=` in the URL
 *
 * The API supports it (`CatalogService.list` takes the same filter) and the
 * server uses it wherever a request is already dynamic. Here it would cost the
 * prerender for a preference that survives one page view, and a shared link to
 * `/courses?stream=general` would silently hide half the catalogue from
 * someone who did not choose it.
 *
 * `radiogroup` rather than three buttons: this is one choice with three
 * mutually exclusive answers, which is what arrow-key navigation and the
 * "3 of 3" announcement both come from for free.
 */
export function StreamFilter({ targetId }: { targetId: string }) {
  const [choice, setChoice] = useState<Choice>('all');

  return (
    <div className="stream-filter">
      <span className="stream-filter__label" id={`${targetId}-stream-label`}>
        {c.filterLabel}
      </span>
      <div
        className="stream-filter__options"
        role="radiogroup"
        aria-labelledby={`${targetId}-stream-label`}
        aria-controls={targetId}
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            className="stream-filter__option"
            onClick={() => {
              setChoice(option.value);
              const grid = document.getElementById(targetId);
              // `all` removes the attribute rather than setting a third value,
              // so the CSS only ever has two rules to state.
              if (option.value === 'all') grid?.removeAttribute('data-stream');
              else grid?.setAttribute('data-stream', option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
