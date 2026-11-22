import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.resetModules();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-fx');
});

describe('<FxToggle>', () => {
  it('turns lite mode on and off, and says which', async () => {
    const { FxToggle } = await import('./fx-toggle');
    render(<FxToggle />);
    const control = screen.getByRole('switch', { name: /الوضع الخفيف/ });
    expect(control).toHaveAttribute('aria-checked', 'false');

    act(() => {
      fireEvent.click(control);
    });
    expect(control).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-fx')).toBe('lite');
    expect(window.localStorage.getItem('fx:mode')).toBe('lite');

    act(() => {
      fireEvent.click(control);
    });
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.hasAttribute('data-fx')).toBe(false);
    expect(window.localStorage.getItem('fx:mode')).toBe('full');
  });

  it('shows the machine’s own verdict, and pressing it takes the effects back', async () => {
    window.localStorage.setItem('fx:weak-device', String(Date.now() - 1000));
    const { FxToggle } = await import('./fx-toggle');
    render(<FxToggle />);
    const control = screen.getByRole('switch', { name: /الوضع الخفيف/ });
    expect(control).toHaveAttribute('aria-checked', 'true');

    act(() => {
      fireEvent.click(control);
    });
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('fx:weak-device')).toBeNull();
  });
});
