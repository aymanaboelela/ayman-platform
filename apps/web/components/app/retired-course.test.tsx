import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RetiredCourseNotice } from './retired-course';

const RETIRED = [{ id: 'c1', slug: 'foundation', title: 'الكورس التأسيسي' }];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('RetiredCourseNotice', () => {
  it('names the retired course', () => {
    render(<RetiredCourseNotice retired={RETIRED} />);
    expect(screen.getByRole('heading', { name: /الكورس التأسيسي/ })).toBeTruthy();
  });

  it('goes away on «تمام، فهمت» and stays away on the next render', () => {
    render(<RetiredCourseNotice retired={RETIRED} />);
    fireEvent.click(screen.getByRole('button', { name: 'تمام، فهمت' }));
    expect(screen.queryByRole('heading')).toBeNull();

    cleanup();
    render(<RetiredCourseNotice retired={RETIRED} />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders nothing when no course was retired', () => {
    const { container } = render(<RetiredCourseNotice retired={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
