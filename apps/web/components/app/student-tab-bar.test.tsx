import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const { StudentTabBar } = await import('./student-tab-bar');

afterEach(() => {
  cleanup();
  nav.pathname = '/dashboard';
});

/**
 * «زرار الباك مش شغال، لازم أضغط أكتر من مرة» — `<Link>` بيدفع history
 * entry جديدة حتى لو الوجهة نفس الصفحة، فدوسة على التاب اللي الطالب واقف
 * فيه أصلًا كانت بتعمل entry متكررة، وزرار الرجوع بيحتاج دوستين.
 */
describe('StudentTabBar — re-tapping the current tab does not push a duplicate history entry', () => {
  it('prevents default on the tab the student is already on', () => {
    render(<StudentTabBar />);
    const current = screen.getByRole('link', { current: 'page' });

    const event = fireEvent.click(current);

    expect(event).toBe(false); // testing-library returns false when defaultPrevented
  });

  it('leaves every OTHER tab free to navigate normally', () => {
    render(<StudentTabBar />);
    const others = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') !== 'page');
    expect(others.length).toBeGreaterThan(0);

    for (const link of others) {
      expect(fireEvent.click(link)).toBe(true);
    }
  });

  it('still prevents default on a different active tab (not just /dashboard)', () => {
    nav.pathname = '/results';
    render(<StudentTabBar />);
    const current = screen.getByRole('link', { current: 'page' });

    expect(fireEvent.click(current)).toBe(false);
  });

  it('does not interfere with a modified press — middle-click, ⌘-click still work', () => {
    render(<StudentTabBar />);
    const current = screen.getByRole('link', { current: 'page' });

    expect(fireEvent.click(current, { metaKey: true })).toBe(true);
    expect(fireEvent.click(current, { button: 1 })).toBe(true);
  });
});
