import { memo } from 'react';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';

/**
 * What the map's three fills and its dot mean — drawn from the same rules
 * (`.runner-nav__swatch--*` mirror `.nav-chip--*`). `aria-hidden`: each chip
 * already says its own state in its accessible name.
 *
 * `memo` with no props: the runner re-renders on every keystroke (the answers
 * live at its top), and this never has a reason to.
 */
export const NavigatorKey = memo(function NavigatorKey() {
  const r = quizExperience.runner;
  return (
    <ul className="runner-nav__key" aria-hidden="true">
      <li className="runner-nav__key-item">
        <span className="runner-nav__swatch runner-nav__swatch--current" />
        {r.legendCurrent}
      </li>
      <li className="runner-nav__key-item">
        <span className="runner-nav__swatch runner-nav__swatch--answered" />
        {r.legendAnswered}
      </li>
      <li className="runner-nav__key-item">
        <span className="runner-nav__swatch" />
        {r.legendOpen}
      </li>
      <li className="runner-nav__key-item">
        <span className="runner-nav__swatch runner-nav__swatch--flagged" />
        {r.legendFlagged}
      </li>
    </ul>
  );
});
