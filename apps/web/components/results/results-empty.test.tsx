import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultsEmpty } from './results-empty';

afterEach(() => {
  cleanup();
});

describe('ResultsEmpty', () => {
  it('is a titled section with the three steps in order and the way to the path', () => {
    render(<ResultsEmpty />);

    expect(screen.getByRole('heading', { level: 2, name: copy.results.emptyTitle })).toBeTruthy();
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([
      `1${copy.results.emptyStep1}`,
      `2${copy.results.emptyStep2}`,
      `3${copy.results.emptyStep3}`,
    ]);
    expect(screen.getByRole('link', { name: copy.results.emptyCta }).getAttribute('href')).toBe('/path');
  });

  it('previews an EMPTY gauge — no arc, no number that could read as a zero score', () => {
    const { container } = render(<ResultsEmpty />);

    expect(container.querySelector('.rs-gauge__arc')).toBeNull();
    expect(container.querySelector('.rs-gauge__num')?.textContent).toBe('—');
    expect(container.querySelector('.rs-gauge__pct')).toBeNull();
  });
});
