import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Meter, StatTile } from './stat-tile';

afterEach(() => {
  cleanup();
});

describe('Meter', () => {
  it('writes its fraction in the same digits as the rest of the page', () => {
    // «20 من 28» was the only Latin-digit figure on «التحليلات», sitting under
    // a «٧٦٪» and beside «٣٬٤٢٦» — see `format.ts` on why `ar-EG` is the rule
    // everywhere but SVG text and CSV cells.
    render(<Meter label="نسبة اللي شافوا" fraction={20 / 28} numerator={20} denominator={28} />);

    expect(screen.getByText('٢٠')).toBeInTheDocument();
    expect(screen.getByText(/٢٨/)).toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();
  });
});

describe('StatTile', () => {
  it('washes a tinted tile in its series hue and leaves the figure in the text colour', () => {
    // The tile has to match its bar by eye, and the number has to stay
    // readable — a figure tinted to match loses most of its contrast.
    const { container } = render(<StatTile label="شهر" value="١٢" tint="var(--viz-1)" />);

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.background).toContain('var(--viz-1)');
    expect(shell.className).not.toContain('bg-surface-2');
    expect(screen.getByText('١٢').className).toContain('text-fg');
  });
});
