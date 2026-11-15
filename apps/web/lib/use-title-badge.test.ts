import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTitleBadge } from './use-title-badge';

describe('useTitleBadge', () => {
  afterEach(() => {
    document.title = '';
  });

  it('prefixes the count, keeps it across a navigation retitle, and strips it on unmount', async () => {
    document.title = 'الوارد';
    const { rerender, unmount } = renderHook(({ n }) => useTitleBadge(n), { initialProps: { n: 3 as number | null } });
    expect(document.title).toBe('(3) الوارد');

    document.title = 'المحادثة';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe('(3) المحادثة');

    rerender({ n: 0 });
    expect(document.title).toBe('المحادثة');

    rerender({ n: 2 });
    unmount();
    expect(document.title).toBe('المحادثة');
  });

  it('does nothing at all for null — so a second instance cannot fight the first', () => {
    document.title = '(5) الوارد';
    renderHook(() => useTitleBadge(null));
    expect(document.title).toBe('(5) الوارد');
  });
});
