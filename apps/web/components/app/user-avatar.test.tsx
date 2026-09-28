import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { avatarHue, UserAvatar } from './user-avatar';

afterEach(() => {
  cleanup();
});

const KEY = 'ab/abcdef01-2345-6789-abcd-ef0123456789.webp';

/**
 * The rule this pins: **the circle is never empty.**
 *
 * Production showed a ring with nothing in it on three screens at once — the
 * topbar, the dashboard band and «كارت الحضور» — because the drawing only
 * existed as a REPLACEMENT for a photo, swapped in by an error event, and a
 * photo layer can paint nothing without ever raising one (in flight, failed
 * before hydration, transparent). So the drawing is asserted as present in
 * every state, including the ones where a photo is also there.
 */
describe('UserAvatar', () => {
  it('draws the figure when there is no photo, and no <img> at all', () => {
    const { container } = render(<UserAvatar name="مريم عبد الرحمن" image={null} size={72} />);

    expect(container.querySelector('.user-avatar__figure')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the figure UNDER a photo, rather than instead of it', () => {
    const { container } = render(<UserAvatar name="مريم عبد الرحمن" image={KEY} size={72} />);

    const figure = container.querySelector('.user-avatar__figure');
    const img = container.querySelector('img');
    expect(figure).not.toBeNull();
    expect(img).toHaveClass('user-avatar__photo');
    // Painted after the figure, so it is the layer on top.
    expect(figure?.compareDocumentPosition(img as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('takes a failed photo out entirely, leaving the figure', () => {
    const { container } = render(<UserAvatar name="مريم عبد الرحمن" image={KEY} size={36} />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.user-avatar__figure')).not.toBeNull();
  });

  it('sends a Google photo and a storage key through the optimiser alike', () => {
    const google = render(
      <UserAvatar name="a" image="https://lh3.googleusercontent.com/a/x=s96-c" size={36} />,
    );
    expect(google.container.querySelector('img')?.getAttribute('src')).toContain(
      encodeURIComponent('https://lh3.googleusercontent.com/a/x=s96-c'),
    );
    cleanup();

    const stored = render(<UserAvatar name="a" image={KEY} size={36} />);
    expect(stored.container.querySelector('img')?.getAttribute('src')).toContain(
      encodeURIComponent(`/media/${KEY}`),
    );
  });

  it('puts the call site class on the circle, whichever layer shows', () => {
    const { container } = render(
      <UserAvatar name="مريم" image={null} size={72} className="dash-hero__avatar" />,
    );
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('user-avatar', 'dash-hero__avatar');
    expect(root.style.width).toBe('72px');
    expect(root.style.getPropertyValue('--avatar-h')).toBe(String(avatarHue('مريم')));
  });
});

describe('avatarHue', () => {
  it('is stable per name, so one student is one colour on every screen', () => {
    expect(avatarHue('مريم عبد الرحمن')).toBe(avatarHue('مريم عبد الرحمن'));
    // Surrounding whitespace is not a different student.
    expect(avatarHue('  مريم عبد الرحمن ')).toBe(avatarHue('مريم عبد الرحمن'));
  });

  it('lands on the twelve-step wheel', () => {
    for (const name of ['أيمن أبو العلا', 'يوسف طارق', 'Sara', '']) {
      const hue = avatarHue(name);
      expect(hue % 30).toBe(0);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
