import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialFigure } from './social-figure';

/*
  The count-up is decoration over a figure that must already be right: in the
  server HTML, under reduced motion, and once it lands. These pin those three,
  plus the one rule that keeps it from looking like the page loaded twice —
  it only arms while the figure is still below the fold.
*/

let reduced = false;
let observed: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  reduced = false;
  observed = null;
  frames = [];
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce') }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Places the figure `top` px down a 800px-tall viewport. */
function at(top: number) {
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
}

const live = (container: HTMLElement) => container.querySelector('.sp-fig__run')!.textContent;
const box = (container: HTMLElement) => container.querySelector<HTMLElement>('.sp-fig')!;

describe('<SocialFigure>', () => {
  it('serves the final figure in the server HTML, once', () => {
    const html = renderToStaticMarkup(<SocialFigure text="+108 آلاف" />);
    expect(html.match(/\+108 آلاف/g)).toHaveLength(1);
  });

  it('arms below the fold at zero, then counts up to the figure when it enters', () => {
    at(1200);
    const { container } = render(<SocialFigure text="+24 ألف" />);

    expect(box(container).dataset.run).toBe('');
    expect(live(container)).toBe('+0 ألف');
    // The server's figure is still there, and still the accessible text.
    expect(container.querySelector('.sp-fig__final')!.textContent).toBe('+24 ألف');

    act(() => observed!([{ isIntersecting: true }]));
    const start = performance.now();
    act(() => frames.shift()!(start + 10_000));

    expect(box(container).dataset.run).toBeUndefined();
    expect(live(container)).toBe('');
  });

  it('leaves a figure already on screen alone', () => {
    at(300);
    const { container } = render(<SocialFigure text="+24 ألف" />);
    expect(box(container).dataset.run).toBeUndefined();
    expect(observed).toBeNull();
  });

  it('does nothing under prefers-reduced-motion', () => {
    reduced = true;
    at(1200);
    const { container } = render(<SocialFigure text="+24 ألف" />);
    expect(box(container).dataset.run).toBeUndefined();
    expect(observed).toBeNull();
  });

  it('does nothing for a figure with no digits', () => {
    at(1200);
    const { container } = render(<SocialFigure text="ألفين" />);
    expect(box(container).dataset.run).toBeUndefined();
  });
});
