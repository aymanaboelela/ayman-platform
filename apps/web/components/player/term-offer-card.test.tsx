import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { formatCopy } from '@ayman/contracts/format';
import { TermOfferCard } from './term-offer-card';

afterEach(cleanup);

const c = copy.player.termOffer;
const TWO = { id: '01a199ea-4afd-7788-978b-291bb3ac5fc1', title: 'الترم التاني', priceCents: 45000 };
const THREE = { id: '5b1e2c7a-0000-4000-8000-000000000003', title: 'الصيفي', priceCents: 20000 };

/**
 * The only door to a term opened for booking before its first lecture — a
 * «الترم الأول» student has no padlock anywhere that leads to it.
 */
describe('TermOfferCard', () => {
  it('renders nothing when there is nothing to offer', () => {
    const { container } = render(<TermOfferCard courseSlug="c" offer={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the one new term and links straight to its payment step', () => {
    render(<TermOfferCard courseSlug="programming-y2" offer={{ terms: [TWO], pending: false }} />);

    expect(screen.getByRole('heading', { name: formatCopy(c.titleOne, { term: TWO.title }) })).toBeTruthy();
    expect(screen.getByRole('link', { name: c.cta })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?plan=term&term=${TWO.id}`,
    );
  });

  it('gives each term its own button — a term purchase names exactly one', () => {
    render(<TermOfferCard courseSlug="p" offer={{ terms: [TWO, THREE], pending: false }} />);

    expect(screen.getByRole('heading', { name: c.titleMany })).toBeTruthy();
    const hrefs = screen.getAllByRole('link', { name: c.cta }).map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      `/courses/p/subscribe?plan=term&term=${TWO.id}`,
      `/courses/p/subscribe?plan=term&term=${THREE.id}`,
    ]);
  });

  it('says the claim is in review instead of offering a button the checkout refuses', () => {
    render(<TermOfferCard courseSlug="p" offer={{ terms: [TWO], pending: true }} />);

    expect(screen.getByText(c.pending)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
