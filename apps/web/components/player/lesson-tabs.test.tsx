import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LessonTabs } from './lesson-tabs';

afterEach(cleanup);

const TABS = [
  { id: 'homework', label: 'الواجب', icon: null, count: 1, alert: true, content: <p>واجب</p> },
  { id: 'materials', label: 'المرفقات', icon: null, count: 3, content: <p>مرفقات</p> },
  { id: 'summary', label: 'الملخص', icon: null, content: <p>ملخص</p> },
];

describe('LessonTabs', () => {
  it('opens on the first tab and keeps the other panels mounted but hidden', () => {
    render(<LessonTabs tabs={TABS} label="أقسام" />);

    expect(screen.getByRole('tab', { name: /الواجب/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('واجب')).toBeVisible();
    // Mounted (a half-typed note or staged homework pages survive a switch)…
    expect(screen.getByText('مرفقات')).toBeInTheDocument();
    // …and hidden.
    expect(screen.getByText('مرفقات').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
  });

  it('switches the panel on press', () => {
    render(<LessonTabs tabs={TABS} label="أقسام" />);

    fireEvent.click(screen.getByRole('tab', { name: /المرفقات/ }));

    expect(screen.getByRole('tab', { name: /المرفقات/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('مرفقات').closest('[role="tabpanel"]')).not.toHaveAttribute('hidden');
    expect(screen.getByText('واجب').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
  });

  it('moves with the arrow keys the way the row reads — ArrowLeft is forward under RTL', () => {
    render(<LessonTabs tabs={TABS} label="أقسام" />);
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /المرفقات/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /الواجب/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: /الملخص/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('prints the counts, red for the one that is a demand', () => {
    render(<LessonTabs tabs={TABS} label="أقسام" />);

    const homework = screen.getByRole('tab', { name: /الواجب/ });
    expect(homework.querySelector('.lp-tab__count--alert')?.textContent).toBe('1');
    const materials = screen.getByRole('tab', { name: /المرفقات/ });
    expect(materials.querySelector('.lp-tab__count')?.textContent).toBe('3');
    expect(materials.querySelector('.lp-tab__count--alert')).toBeNull();
  });

  it('renders nothing for a lecture that carries nothing', () => {
    const { container } = render(<LessonTabs tabs={[]} label="أقسام" />);
    expect(container).toBeEmptyDOMElement();
  });
});
