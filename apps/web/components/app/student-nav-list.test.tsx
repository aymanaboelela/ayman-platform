import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const { StudentNavFooterList, StudentNavList } = await import('./student-nav-list');

afterEach(() => {
  cleanup();
  nav.pathname = '/dashboard';
});

/** نفس درس `student-tab-bar.test.tsx`: اللينك اللي الطالب واقف عليه أصلًا
 *  مايدفعش history entry تانية، والباقي يفضلوا زي ما هم. */
describe('StudentNavList — re-tapping the current link does not push a duplicate history entry', () => {
  it('prevents default on the current link, and still calls onNavigate (closes the sheet)', () => {
    const onNavigate = vi.fn();
    render(<StudentNavList onNavigate={onNavigate} />);
    const current = screen.getByRole('link', { current: 'page' });

    expect(fireEvent.click(current)).toBe(false);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('leaves every other link free to navigate, and still closes the sheet', () => {
    const onNavigate = vi.fn();
    render(<StudentNavList onNavigate={onNavigate} />);
    const others = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') !== 'page');
    expect(others.length).toBeGreaterThan(0);

    for (const link of others) expect(fireEvent.click(link)).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(others.length);
  });
});

describe('StudentNavFooterList — same guard on the footer group', () => {
  it('prevents default only when the footer link IS the current page', () => {
    nav.pathname = '/settings/devices';
    render(<StudentNavFooterList />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const isCurrent = link.getAttribute('aria-current') === 'page';
      expect(fireEvent.click(link)).toBe(!isCurrent);
    }
  });
});
