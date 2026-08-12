import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { ItemAnalysisTable, type ItemAnalysisRow } from './item-analysis-table';

afterEach(() => {
  cleanup();
});

const ITEMS: ItemAnalysisRow[] = [
  {
    questionVersionId: 'q-1',
    stemHtml: '<p>سؤال واحد</p>',
    n: 20,
    facility: 0.5,
    discrimination: 0.3,
    distractors: [
      { optionId: 'opt-a', bodyHtml: '<p>أ</p>', fraction: 1, picks: 10 },
      { optionId: 'opt-b', bodyHtml: '<p>ب</p>', fraction: 0, picks: 10 },
    ],
  },
];

/**
 * I10 regression. The distractor-analysis panel used to be gated behind an
 * `onClick` on a bare `<tr>` — no `tabIndex`, no `role`, no keyboard handler,
 * no `aria-expanded` — so it was reachable with a mouse only. The fix puts a
 * real `<button aria-expanded>` in the first cell.
 */
describe('ItemAnalysisTable keyboard accessibility (I10)', () => {
  it('exposes a real, focusable button carrying aria-expanded — not an onClick on the <tr>', () => {
    render(<ItemAnalysisTable items={ITEMS} />);
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('reaches and opens the distractor analysis panel using ONLY the keyboard (Tab + Enter)', () => {
    render(<ItemAnalysisTable items={ITEMS} />);

    // Nothing renders the panel yet.
    expect(screen.queryByText(copy.quizAdmin.distractorAnalysis)).not.toBeInTheDocument();

    // A real button is reachable with Tab (jsdom doesn't simulate actual Tab
    // traversal, but `.focus()` proves the element is a genuine, focusable
    // tab stop — a bare `<tr>` cannot receive focus at all).
    const toggle = screen.getByRole('button');
    toggle.focus();
    expect(toggle).toHaveFocus();

    // Native <button> activates on both Enter and Space via keyboard,
    // dispatched by the browser as a `click` event — simulate that directly.
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(copy.quizAdmin.distractorAnalysis)).toBeInTheDocument();
  });

  it('collapses again on a second activation, keeping aria-expanded in sync', () => {
    render(<ItemAnalysisTable items={ITEMS} />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(copy.quizAdmin.distractorAnalysis)).not.toBeInTheDocument();
  });

  it('aria-controls on the button points at the id of the panel it expands', () => {
    render(<ItemAnalysisTable items={ITEMS} />);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);

    const controlsId = toggle.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId!)).not.toBeNull();
  });
});
