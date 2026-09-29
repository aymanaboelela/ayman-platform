import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import type { Achievement } from '@/lib/achievements';
import { Achievements } from './achievements';

afterEach(() => {
  cleanup();
});

const c = copy.dashboard.badges;

const markers: Achievement[] = [
  { id: 'first-lesson', glyph: 'play', title: c.firstLessonTitle, hint: c.firstLessonHint, tier: 'bronze', earned: true },
  {
    id: 'ten-lessons',
    glyph: 'layers',
    title: c.tenLessonsTitle,
    hint: c.tenLessonsHint,
    tier: 'silver',
    earned: false,
    progress: { value: 3, target: 10, label: '3 من 10' },
  },
  { id: 'first-pass', glyph: 'medal', title: c.firstPassTitle, hint: c.firstPassHint, tier: 'silver', earned: false },
];

describe('Achievements (aside)', () => {
  it('prints the metal under an earned tile, and progress or the hint under a locked one', () => {
    const { container } = render(<Achievements achievements={markers} earned={1} variant="aside" />);

    const tiles = [...container.querySelectorAll('.badge')];
    expect(tiles[0]?.querySelector('.badge__tier')?.textContent).toBe(c.tierBronze);
    expect(tiles[1]?.querySelector('.badge__hint')?.textContent).toBe('3 من 10');
    expect(tiles[1]?.querySelector<HTMLElement>('.badge__meter-fill')?.style.inlineSize).toBe('30%');
    // No number to show for a single event — the condition itself is printed.
    expect(tiles[2]?.querySelector('.badge__hint')?.textContent).toBe(c.firstPassHint);
  });

  it('puts the progress into the accessible name, where the drawn meter cannot reach', () => {
    render(<Achievements achievements={markers} earned={1} variant="aside" />);

    expect(screen.getByLabelText(new RegExp(`${c.tenLessonsTitle}.*\\(3 من 10\\)`))).toBeInTheDocument();
  });

  it('draws one meter segment per marker, lit for the earned ones', () => {
    const { container } = render(<Achievements achievements={markers} earned={1} variant="aside" />);

    expect(container.querySelectorAll('.award-meter__pip')).toHaveLength(3);
    expect(container.querySelectorAll('.award-meter__pip--on')).toHaveLength(1);
  });
});
