import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const { DrawerMenu } = await import('./drawer-menu');
const { STUDENT_NAV, STUDENT_TABS } = await import('./student-nav-items');

afterEach(() => {
  cleanup();
  nav.pathname = '/dashboard';
});

function renderMenu(onNavigate = vi.fn()) {
  const utils = render(
    <DrawerMenu
      account={<p>account-node</p>}
      courses={<a href="/library/some-course">course-row</a>}
      onNavigate={onNavigate}
    />,
  );
  return { ...utils, onNavigate };
}

function fold(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(name) });
}

describe('DrawerMenu — the four tiles', () => {
  it('draws the bottom bar’s four, in its order, with the current one marked', () => {
    nav.pathname = '/path';
    const { container } = renderMenu();
    const tiles = [...container.querySelectorAll('.dmenu__tile')];

    expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual(STUDENT_TABS.map((item) => item.href));
    expect(container.querySelector('.dmenu__tile[aria-current="page"]')?.getAttribute('href')).toBe('/path');
  });

  it('lights «الكورسات» inside a lesson, through the same alias the rail uses', () => {
    nav.pathname = '/courses/x/lessons/y';
    const { container } = renderMenu();

    expect(container.querySelector('.dmenu__tile[aria-current="page"]')?.getAttribute('href')).toBe('/library');
  });
});

describe('DrawerMenu — every link the old sheet carried is still reachable', () => {
  it('renders every nav row exactly once, plus the site link and the course node', () => {
    const { container } = renderMenu();
    // Open every fold so the hidden bodies count too.
    for (const head of container.querySelectorAll<HTMLButtonElement>('.dmenu__fold-head')) {
      if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head);
    }
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

    for (const item of STUDENT_NAV) {
      expect(hrefs.filter((href) => href === item.href), item.href).toHaveLength(1);
    }
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/library/some-course');
    expect(screen.getByText('account-node')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.theme.toggle })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.nav.logout })).toBeTruthy();
  });
});

describe('DrawerMenu — the folds', () => {
  it('opens the group holding the current page, and only that one', () => {
    nav.pathname = '/badges';
    renderMenu();

    expect(fold(copy.nav.groupGrades).getAttribute('aria-expanded')).toBe('true');
    expect(fold(copy.nav.groupStudy).getAttribute('aria-expanded')).toBe('false');
    expect(fold(copy.nav.railCourses).getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the first group when the current page is a tile, as on the board', () => {
    renderMenu();
    expect(fold(copy.nav.groupStudy).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the course list inside a course', () => {
    nav.pathname = '/courses/x/lessons/y';
    renderMenu();
    expect(fold(copy.nav.railCourses).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('course-row')).toBeTruthy();
  });

  it('keeps one open at a time, and a second press shuts it', () => {
    renderMenu();
    fireEvent.click(fold(copy.nav.groupPlay));
    expect(fold(copy.nav.groupPlay).getAttribute('aria-expanded')).toBe('true');
    expect(fold(copy.nav.groupStudy).getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(fold(copy.nav.groupPlay));
    expect(fold(copy.nav.groupPlay).getAttribute('aria-expanded')).toBe('false');
  });

  it('counts the rows it holds, and does not repeat a tile under «درجاتي»', () => {
    const { container } = renderMenu();
    const grades = fold(copy.nav.groupGrades).closest('.dmenu__fold') as HTMLElement;
    const rows = grades.querySelectorAll('.dmenu__row');

    expect(within(grades).getByText(String(rows.length))).toBeTruthy();
    expect(grades.querySelector('a[href="/results"]')).toBeNull();
    expect(container.querySelectorAll('a[href="/results"]')).toHaveLength(1);
  });
});

describe('DrawerMenu — closing and the history guard', () => {
  it('closes the sheet from a link, and swallows a re-tap on the current page', () => {
    const { container, onNavigate } = renderMenu();
    const current = container.querySelector<HTMLAnchorElement>('.dmenu__tile[aria-current="page"]')!;
    const other = container.querySelector<HTMLAnchorElement>('.dmenu__tile:not([aria-current])')!;

    expect(fireEvent.click(current)).toBe(false);
    expect(fireEvent.click(other)).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('does not close the sheet from the theme switch', () => {
    const { onNavigate } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: copy.theme.toggle }));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
