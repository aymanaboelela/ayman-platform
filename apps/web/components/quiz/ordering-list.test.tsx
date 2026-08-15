import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { OrderingList } from './ordering-list';

const OPTIONS = [
  { id: 'cpu', bodyHtml: '<p>CPU</p>' },
  { id: 'cache', bodyHtml: '<p>Cache</p>' },
  { id: 'ram', bodyHtml: '<p>RAM</p>' },
];

afterEach(cleanup);

/** The rendered sequence, read off the visible position numbers' rows. */
function renderedOrder(): string[] {
  return Array.from(document.querySelectorAll('li')).map(
    (row) => row.textContent?.replace(/\d+/, '').trim() ?? '',
  );
}

describe('OrderingList', () => {
  it('renders the served order when the student has not touched anything', () => {
    render(<OrderingList options={OPTIONS} value={[]} onChange={vi.fn()} />);
    expect(renderedOrder()).toEqual(['CPU', 'Cache', 'RAM']);
  });

  it('renders the student’s stored order, not the served one', () => {
    render(<OrderingList options={OPTIONS} value={['ram', 'cpu', 'cache']} onChange={vi.fn()} />);
    expect(renderedOrder()).toEqual(['RAM', 'CPU', 'Cache']);
  });

  it('emits the WHOLE sequence on a move, so a saved answer is never half-written', () => {
    const onChange = vi.fn();
    render(<OrderingList options={OPTIONS} value={[]} onChange={onChange} />);

    // Move the second row up.
    fireEvent.click(screen.getAllByRole('button', { name: copy.quiz.moveUp })[1]!);

    expect(onChange).toHaveBeenCalledWith(['cache', 'cpu', 'ram']);
  });

  it('disables the move that would fall off the end of the list', () => {
    render(<OrderingList options={OPTIONS} value={[]} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: copy.quiz.moveUp })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: copy.quiz.moveDown })[2]).toBeDisabled();
  });

  it('announces the item and its new position — the reflow is invisible to a screen reader', () => {
    const { container } = render(<OrderingList options={OPTIONS} value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: copy.quiz.moveDown })[0]!);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('CPU');
    // Announced as text: an option body is HTML and must never reach a live
    // region as tags.
    expect(live?.textContent).not.toContain('<p>');
  });

  it('drops ids the question no longer serves and appends ones the response never mentioned', () => {
    // A republished version between two sittings: `gone` is not served any
    // more, and `ram` was added. Neither may strand the student.
    render(
      <OrderingList options={OPTIONS} value={['gone', 'cache', 'cpu']} onChange={vi.fn()} />,
    );
    expect(renderedOrder()).toEqual(['Cache', 'CPU', 'RAM']);
  });
});
