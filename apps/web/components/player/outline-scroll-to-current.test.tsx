import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OutlineScrollToCurrent } from './outline-scroll-to-current';

afterEach(cleanup);

/*
 * jsdom has no layout. Ref callbacks run in the commit, before the passive
 * effect under test, so they are where the geometry is faked: a 400px panel
 * over 2000px of rows, with the current row 1200px down it.
 */
function fakePanel(element: HTMLElement | null) {
  if (!element) return;
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(element, 'scrollTop', { configurable: true, writable: true, value: 0 });
  element.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
}

function fakeRow(element: HTMLElement | null) {
  if (!element) return;
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 60 });
  element.getBoundingClientRect = () => ({ top: 1300 }) as DOMRect;
}

/**
 * The outline opens on the lesson the student is on — and since #223 it
 * opened on lesson 1 instead: the effect looked for `[aria-current="page"]`
 * while `LessonRow` writes `aria-current="true"`.
 */
describe('OutlineScrollToCurrent', () => {
  it('centres the row the sidebar marks current, whatever value it writes', () => {
    const { container } = render(
      <nav data-course-outline="" ref={fakePanel}>
        <ol>
          <li>أول درس</li>
          <li aria-current="true" ref={fakeRow}>
            الدرس الحالي
          </li>
        </ol>
        <OutlineScrollToCurrent activeLessonId="l2" />
      </nav>,
    );
    const panel = container.querySelector<HTMLElement>('[data-course-outline]')!;
    // 1300 − 100 − (400 − 60) / 2
    expect(panel.scrollTop).toBe(1030);
  });
});
