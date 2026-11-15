import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { CourseSideLinks } from './course-side-links';

afterEach(cleanup);

const c = copy.player;
const RATES = { cairo: 5000, giza: 6000, other: 8000 } as never;

describe('CourseSideLinks', () => {
  it('renders nothing when the group, the number and the book are all unset', () => {
    const { container } = render(<CourseSideLinks groupUrl={null} whatsapp={null} book={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the group and the help DM as two link rows', () => {
    render(<CourseSideLinks groupUrl="https://chat.whatsapp.com/abc" whatsapp="+201021196367" book={null} />);

    expect(screen.getByRole('link', { name: new RegExp(c.group.title) })).toHaveAttribute(
      'href',
      'https://chat.whatsapp.com/abc',
    );
    expect(screen.getByRole('link', { name: new RegExp(c.sideLinks.help) }).getAttribute('href')).toContain(
      'wa.me/201021196367',
    );
  });

  it('drops a row whose setting is unset rather than falling back', () => {
    render(<CourseSideLinks groupUrl={null} whatsapp="+201021196367" book={null} />);

    expect(screen.queryByRole('link', { name: new RegExp(c.group.title) })).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(c.sideLinks.help) })).toBeTruthy();
  });

  it('adds «اطلب الكتاب» as a third row when the course sells one', () => {
    render(
      <CourseSideLinks
        groupUrl={null}
        whatsapp={null}
        book={{
          courseId: 'c1',
          bookTitle: 'الكتاب',
          bookPriceCents: 15000,
          shippingRates: RATES,
          instapay: null,
          vodafoneCash: null,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: new RegExp(copy.bookOrder.cta) })).toBeInTheDocument();
  });
});
