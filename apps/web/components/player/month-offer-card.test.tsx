import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { formatCopy } from '@ayman/contracts/format';
import { MonthOfferCard } from './month-offer-card';

afterEach(cleanup);

const c = copy.player.monthOffer;
const TWO = { id: '43b617d0-ed92-4c60-9a8d-a18c2ee22df2', title: 'شهر ٢', lessonCount: 0, priceCents: 15000 };
const THREE = { id: '5b1e2c7a-0000-4000-8000-000000000003', title: 'شهر ٣', lessonCount: 5, priceCents: 15000 };

/**
 * The only door to a month the student does not hold yet — see
 * `CourseOutline.monthOffer`. «شهر ٢» opened with no lecture in it had no
 * padlock anywhere, so every student holding «شهر ١» had no way to buy it.
 */
describe('MonthOfferCard', () => {
  it('renders nothing when there is nothing to offer', () => {
    const { container } = render(<MonthOfferCard courseSlug="c" offer={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the one new month and links to its checkout', () => {
    render(<MonthOfferCard courseSlug="programming-y2" offer={{ months: [TWO], pending: false }} />);

    expect(screen.getByRole('heading', { name: formatCopy(c.titleOne, { month: 'شهر ٢' }) })).toBeTruthy();
    // A month opened before its lectures says so, not «0 محاضرة».
    expect(screen.getByText(copy.subscribe.monthCardEmpty)).toBeTruthy();
    expect(screen.getByRole('link', { name: c.ctaOne })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?month=${TWO.id}`,
    );
  });

  it('offers several months ticked, and the link follows the taps', () => {
    render(<MonthOfferCard courseSlug="programming-y2" offer={{ months: [TWO, THREE], pending: false }} />);

    expect(screen.getByRole('link', { name: c.ctaMany })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?month=${TWO.id},${THREE.id}`,
    );

    fireEvent.click(screen.getByRole('button', { name: new RegExp(THREE.title) }));

    expect(screen.getByRole('button', { name: new RegExp(THREE.title) })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: c.ctaMany })).toHaveAttribute(
      'href',
      `/courses/programming-y2/subscribe?month=${TWO.id}`,
    );
  });

  it('has no link at all with nothing chosen, and says why', () => {
    render(<MonthOfferCard courseSlug="programming-y2" offer={{ months: [TWO, THREE], pending: false }} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(TWO.title) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(THREE.title) }));

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(c.noneChosen)).toBeTruthy();
  });

  it('says a claim is being reviewed instead of offering a second one', () => {
    render(<MonthOfferCard courseSlug="programming-y2" offer={{ months: [TWO], pending: true }} />);

    expect(screen.getByText(c.pending)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
