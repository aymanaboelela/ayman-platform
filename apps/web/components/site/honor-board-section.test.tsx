import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import { HonorBoardSection } from './honor-board-section';

/**
 * لوحة الشرف — which picture the public board is allowed to draw.
 *
 * This is the only page on the platform that names a minor to the whole
 * internet, so "whose photo is this" is not a styling detail: the payload
 * carries the student's OWN avatar (`avatarKey`) beside the one an instructor
 * cleared for this board (`photoKey`), and rendering the wrong one publishes a
 * child's face that nobody agreed to publish. The two assertions below are the
 * ones a reviewer cannot make by reading the component, because both keys are
 * strings and either would render.
 */

const BASE: HonorBoardEntry = {
  studentName: 'زياد أيمن',
  avatarKey: 'https://lh3.googleusercontent.com/selfie',
  photoKey: null,
  quizTitle: 'امتحان نص الشهر الأول',
  courseLabel: 'تانية بكالوريا — عربي',
  rank: 1,
  scaledScore: 100,
  gradeOutOf: 100,
  percent: 100,
};

afterEach(cleanup);

describe('HonorBoardSection', () => {
  it('draws the instructor photo and never the student’s own avatar', () => {
    const { container } = render(
      <HonorBoardSection entries={[{ ...BASE, photoKey: 'ab/zeyad.webp' }]} />,
    );

    const image = container.querySelector('img.honor-board__slot-avatar');
    expect(image).toBeTruthy();
    // `next/image` rewrites the attribute through the optimizer, so the KEY is
    // what to look for — the origin and the query string belong to Next.
    expect(image?.getAttribute('src')).toContain(encodeURIComponent('ab/zeyad.webp'));
    expect(container.innerHTML).not.toContain('googleusercontent');
  });

  it('falls back to initials for a winner with no board photo', () => {
    // The ordinary case: most winners have none and he adds them as he gets
    // them. A monogram is the board as it has always looked, not a card that
    // failed to load — so the disc has to be there either way.
    const { container } = render(<HonorBoardSection entries={[BASE]} />);

    expect(container.querySelector('img.honor-board__slot-avatar')).toBeNull();
    expect(container.querySelector('.honor-board__slot-avatar')?.textContent).toBe('زأ');
    expect(container.innerHTML).not.toContain('googleusercontent');
  });
});
