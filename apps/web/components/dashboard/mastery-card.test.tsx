import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { MasteryCard } from './mastery-card';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup, so without this each `render` leaves its
// tree in the document and `getByText` starts finding two of everything.
afterEach(() => {
  cleanup();
});

const c = copy.dashboard.mastery;

const topic = {
  categoryId: '0198c3a2-0000-7000-8000-000000000001',
  name: 'الحلقات المتداخلة',
  answered: 6,
  accuracyPercent: 34,
  lessonId: '0198c3a2-0000-7000-8000-000000000002',
  lessonTitle: 'الحلقات',
  courseSlug: 'cs-y2',
};

describe('MasteryCard', () => {
  it('renders one row per weak topic with its own review link', () => {
    render(
      <MasteryCard
        mastery={{
          weakest: [
            topic,
            { ...topic, categoryId: 'b', name: 'المصفوفات', accuracyPercent: 68 },
          ],
          strongest: [],
          evaluated: 5,
          pending: 0,
        }}
      />,
    );

    expect(screen.getByText('الحلقات المتداخلة')).toBeInTheDocument();
    expect(screen.getByText('المصفوفات')).toBeInTheDocument();
    // One button per row — never a single button at the bottom of the card for
    // three different problems.
    expect(screen.getAllByRole('link', { name: new RegExp(c.reviewCta) })).toHaveLength(2);
  });

  it('renders a row with no button when its lesson could not be resolved', () => {
    render(
      <MasteryCard
        mastery={{
          weakest: [{ ...topic, lessonId: null, lessonTitle: null, courseSlug: null }],
          strongest: [],
          evaluated: 1,
          pending: 0,
        }}
      />,
    );

    expect(screen.getByText('الحلقات المتداخلة')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the first-run body when nothing has been measured', () => {
    render(<MasteryCard mastery={{ weakest: [], strongest: [], evaluated: 0, pending: 0 }} />);

    expect(screen.getByText(c.emptyBody)).toBeInTheDocument();
  });

  it('congratulates rather than emptying when every topic is above the bar', () => {
    render(
      <MasteryCard
        mastery={{
          weakest: [],
          strongest: [{ ...topic, name: 'المتغيّرات', accuracyPercent: 96 }],
          evaluated: 4,
          pending: 0,
        }}
      />,
    );

    expect(screen.getByText(c.allClearBody)).toBeInTheDocument();
    expect(screen.getByText(/المتغيّرات/)).toBeInTheDocument();
    expect(screen.queryByText(c.emptyBody)).not.toBeInTheDocument();
  });

  it('draws no fill at all on a topic scored zero', () => {
    // The bar's fill carries a 3px floor so a 2% topic stays visible. Without
    // this branch that floor would put ink on a topic that collected nothing,
    // and 0% would look like 2%. The washed track is what carries a zero row.
    const { container } = render(
      <MasteryCard
        mastery={{
          weakest: [{ ...topic, accuracyPercent: 0 }],
          strongest: [],
          evaluated: 1,
          pending: 0,
        }}
      />,
    );

    expect(container.querySelector('.topic-row__bar')).toBeInTheDocument();
    expect(container.querySelector('.topic-row__fill')).not.toBeInTheDocument();
  });

  it('draws a fill on any topic above zero', () => {
    const { container } = render(
      <MasteryCard
        mastery={{
          weakest: [{ ...topic, accuracyPercent: 2 }],
          strongest: [],
          evaluated: 1,
          pending: 0,
        }}
      />,
    );

    expect(container.querySelector<HTMLElement>('.topic-row__fill')?.style.inlineSize).toBe('2%');
  });

  it('names each row for a screen reader, since the bar is decorative', () => {
    render(<MasteryCard mastery={{ weakest: [topic], strongest: [], evaluated: 1, pending: 0 }} />);

    expect(
      screen.getByText(
        c.accessibleRow.replace('{topic}', 'الحلقات المتداخلة').replace('{percent}', '34'),
      ),
    ).toBeInTheDocument();
  });
});
