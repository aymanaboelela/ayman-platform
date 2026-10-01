import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const { StudentRail } = await import('./student-rail');

afterEach(() => {
  cleanup();
  nav.pathname = '/dashboard';
});

// `copy.nav.dashboard` names BOTH the brand logo and the nav list's own
// «حسابي» pill — `.rail__brand` is the brand link specifically.
function brandLink(container: HTMLElement): HTMLElement {
  return container.querySelector('.rail__brand')!;
}

/** البراند في الريل لينك لـ`/dashboard` بردو — نفس باج التاب بار بالظبط. */
describe('StudentRail — the brand logo does not push a duplicate /dashboard entry', () => {
  it('prevents default when already on /dashboard', () => {
    const { container } = render(<StudentRail courses={null} forcedCollapsed={false} />);

    expect(fireEvent.click(brandLink(container))).toBe(false);
  });

  it('navigates normally from any other page', () => {
    nav.pathname = '/results';
    const { container } = render(<StudentRail courses={null} forcedCollapsed={false} />);

    expect(fireEvent.click(brandLink(container))).toBe(true);
  });
});
