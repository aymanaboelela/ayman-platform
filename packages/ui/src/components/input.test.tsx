import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';
import { Label } from './label';

describe('Input', () => {
  it('sets aria-invalid only when invalid', () => {
    const { rerender } = render(<Input aria-label="حقل" />);
    expect(screen.getByLabelText('حقل')).not.toHaveAttribute('aria-invalid');
    rerender(<Input aria-label="حقل" invalid />);
    expect(screen.getByLabelText('حقل')).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses no physical-direction utility', () => {
    const { container } = render(<Label required>اسم</Label>);
    const classes = container.querySelector('span')?.className ?? '';
    expect(classes).toContain('ms-1');
    expect(classes).not.toMatch(/\bml-|\bmr-/);
  });
});
