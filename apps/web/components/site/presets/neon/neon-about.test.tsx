import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The `about` block's picture — and the two-step gap that kept it off the page.
 *
 * A block payload has only ever carried the asset's UUID, and `mediaUrl()`
 * needs the row's `storage_key`. Deriving one from the other is the bug that
 * 404'd every admin-chosen favicon for months, so nothing tried, and the
 * comment in `board-panel.tsx` recorded the field as deliberately unread:
 * «either a new resolved field on `HomeBlockSchema` or a per-render lookup».
 *
 * These tests fail on the code that shipped that way — the first because the
 * component took no such prop at all. The second is the half of it that is
 * easy to lose in a tidy-up: a section with no picture must render exactly as
 * it did before the field existed, because that is what every stack whose
 * admin has not chosen one still gets.
 */

/* `className` is forwarded as well as `src`/`alt`, unlike the stub in
   `neon-instructor.test.tsx`: these assertions find the element BY its class,
   so a stub that drops it would fail every one of them for a reason that has
   nothing to do with the component. */
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const { NeonAbout } = await import('./neon-about');

afterEach(cleanup);

const BASE = {
  title: 'مين محمد صبري؟',
  body1: 'سطر أول',
  body2: '',
  role: 'مهندس برمجيات',
  chips: [] as readonly string[],
  blockKey: 'about',
  level: 2 as const,
};

describe('the about block draws the picture the admin chose', () => {
  it('renders the resolved key, not the asset id', () => {
    const { container } = render(<NeonAbout {...BASE} imageKey="26/262f55e7.webp" />);

    const image = container.querySelector('.neon-about__image');
    expect(image).not.toBeNull();
    // The whole point of `imageKey`: a URL built from the storage key. A src
    // containing a bare UUID would mean somebody reached for `imageAssetId`.
    expect(image?.getAttribute('src')).toContain('26/262f55e7.webp');
  });

  it('draws no figure at all when no picture was chosen', () => {
    const { container } = render(<NeonAbout {...BASE} imageKey={null} />);

    expect(container.querySelector('.neon-about__figure')).toBeNull();
    // Still a section, still the admin's words — «no picture» is not «no
    // block». An empty framed box would be worse than the old behaviour.
    expect(container.textContent).toContain('سطر أول');
  });

  it('anchors the section on the block key, so two of them can coexist', () => {
    // The whole reason the id is a prop: a landing page can carry «why this
    // is easy» and «who teaches it» as two `about` blocks, and two sections
    // sharing `id="about"` is invalid HTML whose in-page links break silently.
    const { container } = render(
      <NeonAbout {...BASE} blockKey="about-teacher" imageKey={null} />,
    );

    expect(container.querySelector('section')?.id).toBe('about-teacher');
  });

  it('leaves the picture out of the accessible name', () => {
    const { container } = render(<NeonAbout {...BASE} imageKey="26/262f55e7.webp" />);

    // The heading and the paragraphs already say who this is; a described
    // photograph would be the third time a screen reader hears it.
    expect(container.querySelector('.neon-about__figure')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.neon-about__image')?.getAttribute('alt')).toBe('');
  });
});
