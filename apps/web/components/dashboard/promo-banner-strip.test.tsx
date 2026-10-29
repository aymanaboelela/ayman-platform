import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { promoBannersCopy } from '@ayman/contracts/copy/promo-banners';
import type { ShownPromoBanner } from '@/lib/promo-banners';
import { PromoBannerStrip } from './promo-banner-strip';

afterEach(cleanup);

const c = promoBannersCopy.student;
const KEY = 'ab/0192f0e4-7b1c-7cc0-9f00-0123456789ab.webp';

function banner(over: Partial<ShownPromoBanner> = {}): ShownPromoBanner {
  return {
    id: 'b1',
    title: null,
    imageKey: KEY,
    linkUrl: null,
    linkKind: null,
    years: [],
    startsOn: null,
    endsOn: null,
    ...over,
  };
}

/**
 * «البانرات الترويجية» on the dashboard. Who sees which banner is decided on
 * the server (`bannersFor`); this is only what the strip draws for a list.
 */
describe('PromoBannerStrip', () => {
  it('draws nothing at all for an empty list — the dashboard looks as it did before', () => {
    const { container } = render(<PromoBannerStrip banners={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('one banner: the picture, no arrows, no dots', () => {
    render(<PromoBannerStrip banners={[banner({ title: 'خصم الأسبوع' })]} />);
    expect(screen.getByRole('region', { name: c.region })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'خصم الأسبوع' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: c.next })).toBeNull();
    expect(screen.queryByRole('button', { name: c.goTo.replace('{n}', '1') })).toBeNull();
  });

  it('an internal link stays in the tab; an outside one opens a new tab with noopener', () => {
    render(
      <PromoBannerStrip
        banners={[
          banner({ id: 'in', title: 'المكتبة', linkUrl: '/library', linkKind: 'internal' }),
          banner({ id: 'out', title: 'القناة', linkUrl: 'https://example.com/x', linkKind: 'external' }),
        ]}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/library');
    expect(links[0]).not.toHaveAttribute('target');
    expect(links[1]).toHaveAttribute('href', 'https://example.com/x');
    expect(links[1]).toHaveAttribute('target', '_blank');
    expect(links[1]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('a link that failed the rule is drawn as a plain picture, not a link', () => {
    render(<PromoBannerStrip banners={[banner({ linkUrl: '//evil.example', linkKind: null })]} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('several: arrows and one dot per banner, the first one current', () => {
    render(<PromoBannerStrip banners={[banner({ id: 'a' }), banner({ id: 'b' }), banner({ id: 'c' })]} />);
    expect(screen.getByRole('button', { name: c.previous })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: c.next })).toBeInTheDocument();
    const dots = [1, 2, 3].map((n) => screen.getByRole('button', { name: c.goTo.replace('{n}', String(n)) }));
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    expect(dots[1]).not.toHaveAttribute('aria-current');
  });

  it('drops a banner whose picture fails to load', () => {
    render(<PromoBannerStrip banners={[banner({ id: 'a', title: 'أ' }), banner({ id: 'b', title: 'ب' })]} />);
    fireEvent.error(screen.getByRole('img', { name: 'أ' }));
    expect(screen.queryByRole('img', { name: 'أ' })).toBeNull();
    // One left: the controls go with the second banner.
    expect(screen.queryByRole('button', { name: c.next })).toBeNull();
  });
});
