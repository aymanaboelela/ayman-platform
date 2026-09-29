import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import { RouteScrollReset, isPageTopOffscreen, shouldResetScroll } from './route-scroll-reset';

describe('shouldResetScroll', () => {
  const push = { previousPathname: '/', pathname: '/years/1', hash: '', pushed: true };

  it('resets on a push to a new pathname', () => {
    expect(shouldResetScroll(push)).toBe(true);
  });

  it('leaves the first load to the browser', () => {
    expect(shouldResetScroll({ ...push, previousPathname: null })).toBe(false);
  });

  it('leaves back/forward, and a replace, alone', () => {
    expect(shouldResetScroll({ ...push, pushed: false })).toBe(false);
  });

  // `/years/[year]` pages its filters through the query with `scroll={false}`.
  it('ignores a search-param-only change', () => {
    expect(shouldResetScroll({ ...push, previousPathname: '/years/1' })).toBe(false);
  });

  it('leaves a hash link to the jump it asked for', () => {
    expect(shouldResetScroll({ ...push, hash: '#faq' })).toBe(false);
    expect(shouldResetScroll({ ...push, hash: '#' })).toBe(true);
  });
});

describe('isPageTopOffscreen', () => {
  it('does nothing at the top already', () => {
    expect(isPageTopOffscreen(-40, 0, 900)).toBe(false);
  });

  // The reported case: the old offset clamped to the new page's maximum.
  it('scrolls when the page starts above the viewport', () => {
    expect(isPageTopOffscreen(-1580, 1666, 900)).toBe(true);
  });

  // Next already scrolled, or a layout keeps the page top on screen.
  it('leaves a page whose top is in view', () => {
    expect(isPageTopOffscreen(64, 120, 900)).toBe(false);
  });

  it('scrolls when only a skeleton is on screen and the offset is not zero', () => {
    expect(isPageTopOffscreen(null, 400, 900)).toBe(true);
  });
});

describe('<RouteScrollReset> without the Navigation API (popstate)', () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nav.pathname = '/';
    window.history.replaceState(null, '', '/');
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('scrollY', 1666);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function navigate(rerender: (ui: React.ReactElement) => void, url: string) {
    window.history.pushState(null, '', url);
    nav.pathname = new URL(url, 'http://localhost').pathname;
    rerender(<RouteScrollReset />);
  }

  it('scrolls to the top after a push, and not on the first load', () => {
    const { rerender } = render(<RouteScrollReset />);
    expect(scrollTo).not.toHaveBeenCalled();

    navigate(rerender, '/years/1');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('does not scroll on back/forward', () => {
    const { rerender } = render(<RouteScrollReset />);
    navigate(rerender, '/years/1');
    scrollTo.mockClear();

    window.history.replaceState(null, '', '/');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    nav.pathname = '/';
    rerender(<RouteScrollReset />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  // A popstate that changed only the query commits nothing here; it must not
  // swallow the next real push.
  it('does not let a query-only traversal swallow the next push', () => {
    const { rerender } = render(<RouteScrollReset />);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    navigate(rerender, '/courses');
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not scroll on a hash link or a search-param change', () => {
    const { rerender } = render(<RouteScrollReset />);
    navigate(rerender, '/?filter=free');
    navigate(rerender, '/about#team');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

/**
 * Chrome commits a Back before `popstate` reaches any listener (measured on a
 * production build), so where the Navigation API exists the component takes
 * the kind of navigation from its `navigate` event instead.
 */
describe('<RouteScrollReset> with the Navigation API', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  let navigation: EventTarget;

  function navigateEvent(navigationType: string, url: string) {
    const event = new Event('navigate');
    Object.assign(event, { navigationType, destination: { url: new URL(url, 'http://localhost').href } });
    navigation.dispatchEvent(event);
  }

  beforeEach(() => {
    nav.pathname = '/';
    window.history.replaceState(null, '', '/');
    navigation = new EventTarget();
    vi.stubGlobal('navigation', navigation);
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('scrollY', 1666);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function commit(rerender: (ui: React.ReactElement) => void, pathname: string) {
    nav.pathname = pathname;
    rerender(<RouteScrollReset />);
  }

  it('scrolls after a push', () => {
    const { rerender } = render(<RouteScrollReset />);
    navigateEvent('push', '/years/1');
    commit(rerender, '/years/1');
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  // The measured order: traverse, then Next's own replaceState in the commit,
  // then the commit — and only afterwards `popstate`.
  it('does not scroll on a traversal, even though Next replaces the entry', () => {
    const { rerender } = render(<RouteScrollReset />);
    navigateEvent('traverse', '/');
    navigateEvent('replace', '/');
    commit(rerender, '/courses');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll on a replace to a new pathname', () => {
    const { rerender } = render(<RouteScrollReset />);
    navigateEvent('replace', '/dashboard');
    commit(rerender, '/dashboard');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('matches an encoded destination against a decoded pathname', () => {
    const { rerender } = render(<RouteScrollReset />);
    navigateEvent('push', '/news/%D8%AE%D8%A8%D8%B1');
    commit(rerender, '/news/خبر');
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
