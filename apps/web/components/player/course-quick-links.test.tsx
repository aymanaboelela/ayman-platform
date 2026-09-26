import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { CourseQuickLinks } from './course-quick-links';

afterEach(cleanup);

const c = copy.player;

describe('CourseQuickLinks', () => {
  it('renders nothing when neither the group nor the number is set', () => {
    const { container } = render(<CourseQuickLinks groupUrl={null} whatsapp={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('puts the group and the help DM side by side, each its own link', () => {
    render(<CourseQuickLinks groupUrl="https://chat.whatsapp.com/abc" whatsapp="+201021196367" />);

    expect(screen.getByRole('link', { name: new RegExp(c.group.title) })).toHaveAttribute(
      'href',
      'https://chat.whatsapp.com/abc',
    );
    expect(screen.getByRole('link', { name: new RegExp(c.help.title) }).getAttribute('href')).toContain(
      'wa.me/201021196367',
    );
  });

  it('drops a tile whose setting is unset rather than falling back', () => {
    render(<CourseQuickLinks groupUrl={null} whatsapp="+201021196367" />);

    expect(screen.queryByRole('link', { name: new RegExp(c.group.title) })).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(c.help.title) })).toBeTruthy();
  });

  // `localStorage` is absent in this environment, which is exactly the
  // private-window case: the switch must still work for the page view.
  it('folds away, and comes back, on the switch', () => {
    render(<CourseQuickLinks groupUrl="https://chat.whatsapp.com/abc" whatsapp={null} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.quickLinks.hide) }));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(c.quickLinks.show) })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.quickLinks.show) }));
    expect(screen.getByRole('link', { name: new RegExp(c.group.title) })).toBeTruthy();
  });
});
