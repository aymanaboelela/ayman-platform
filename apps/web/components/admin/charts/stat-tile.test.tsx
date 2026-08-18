import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Meter } from './stat-tile';

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
