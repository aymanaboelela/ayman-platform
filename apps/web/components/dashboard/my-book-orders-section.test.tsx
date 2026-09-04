import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import type { BookOrder, BookOrderStatus } from '@ayman/contracts/book-orders';
import { MyBookOrdersSection } from './my-book-orders-section';

// Explicit, as every component test in this repo does it — `vitest.setup.ts`
// registers no automatic cleanup, so without this each `render` leaves its tree
// in the document and `getByText` starts finding two of everything.
afterEach(() => {
  cleanup();
});

const c = copy.books.mine;

const SUPPORT = 'https://wa.me/201021196367';

function order(overrides: Partial<BookOrder> = {}): BookOrder {
  return {
    id: '0198c3a2-0000-7000-8000-000000000001',
    courseId: null,
    courseTitle: null,
    bookTitle: 'كتاب البرمجة',
    items: [
      {
        bookId: '0198c3a2-0000-7000-8000-0000000000a1',
        titleAr: 'كتاب البرمجة',
        unitPriceCents: 25000,
        quantity: 1,
        forGeneral: true,
        forLanguages: false,
      },
    ],
    amountCents: 31500,
    itemsCents: 25000,
    shippingCents: 6500,
    discountCents: 0,
    status: 'paid',
    fullName: 'طالب',
    phone: '+201021196367',
    altPhone: '+201021196368',
    governorateCode: 'CA',
    city: 'القاهرة',
    addressStreet: 'شارع',
    addressBuilding: null,
    addressNote: null,
    senderPhone: null,
    paidAt: null,
    shippedAt: null,
    deliveredAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * ## The absent-card contract
 *
 * `getMyBookOrdersOrEmpty` catches its own failure and returns `[]` — the same
 * value a student who never ordered a book produces. That is only safe because
 * this section renders NOTHING for `[]`, which is what makes an unreachable API
 * look like the dashboard from last week rather than like a broken card.
 */
describe('MyBookOrdersSection — nothing to show', () => {
  it('renders nothing at all when there are no orders', () => {
    const { container } = render(<MyBookOrdersSection orders={[]} supportHref={SUPPORT} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the read failed, which arrives as the same empty list', () => {
    // There is deliberately no distinguishable "it failed" state: the page a
    // student sees on a bad minute is the page they saw yesterday.
    const { container } = render(<MyBookOrdersSection orders={[]} supportHref={null} />);

    expect(container.textContent).toBe('');
    expect(screen.queryByText(c.title)).not.toBeInTheDocument();
  });
});

describe('MyBookOrdersSection — the reassurance line', () => {
  const statuses: BookOrderStatus[] = [
    'address_only',
    'paid',
    'shipped',
    'delivered',
    'rejected',
  ];
  const notes: Record<BookOrderStatus, string> = {
    address_only: c.noteAddressOnly,
    paid: c.notePaid,
    shipped: c.noteShipped,
    delivered: c.noteDelivered,
    rejected: c.noteRejected,
  };

  for (const status of statuses) {
    it(`states the ${status} note, and no other status's`, () => {
      render(
        <MyBookOrdersSection
          orders={[
            order({
              status,
              rejectionReason: status === 'rejected' ? 'العنوان مش مكتمل' : null,
            }),
          ]}
          supportHref={SUPPORT}
        />,
      );

      expect(screen.getByText(notes[status])).toBeInTheDocument();
      for (const other of statuses.filter((s) => s !== status)) {
        expect(screen.queryByText(notes[other])).not.toBeInTheDocument();
      }
    });
  }
});

describe('MyBookOrdersSection — a rejected order', () => {
  it("prints the admin's own words verbatim, not a paraphrase", () => {
    // Same rule `payment_rejected` follows: a reason paraphrased by the
    // platform is a reason the student argues with instead of acting on.
    render(
      <MyBookOrdersSection
        orders={[order({ status: 'rejected', rejectionReason: 'الكتاب خلص من المخزن' })]}
        supportHref={SUPPORT}
      />,
    );

    expect(screen.getByText('الكتاب خلص من المخزن')).toBeInTheDocument();
    expect(screen.getByText(c.rejectionReason)).toBeInTheDocument();
  });
});

describe('MyBookOrdersSection — «كلّم الدعم»', () => {
  it('offers support on a delivered order', () => {
    render(<MyBookOrdersSection orders={[order({ status: 'delivered' })]} supportHref={SUPPORT} />);

    expect(screen.getByRole('link', { name: c.support })).toHaveAttribute('href', SUPPORT);
  });

  it('offers support on a rejected order', () => {
    render(
      <MyBookOrdersSection
        orders={[order({ status: 'rejected', rejectionReason: 'العنوان غلط' })]}
        supportHref={SUPPORT}
      />,
    );

    expect(screen.getByRole('link', { name: c.support })).toBeInTheDocument();
  });

  it('does not offer support on an order still moving', () => {
    // The note already says what happens next; a support link here invites the
    // phone call this whole section exists to prevent.
    render(<MyBookOrdersSection orders={[order({ status: 'shipped' })]} supportHref={SUPPORT} />);

    expect(screen.queryByRole('link', { name: c.support })).not.toBeInTheDocument();
  });

  it('renders no support link when no number is configured', () => {
    // A «كلّم الدعم» button that opens WhatsApp's own marketing page is a bug
    // this repo has shipped once already — see `waMeHref`.
    render(<MyBookOrdersSection orders={[order({ status: 'delivered' })]} supportHref={null} />);

    expect(screen.queryByRole('link', { name: c.support })).not.toBeInTheDocument();
  });
});

describe('MyBookOrdersSection — the way out', () => {
  it('links to the full history and offers another order', () => {
    render(<MyBookOrdersSection orders={[order()]} supportHref={SUPPORT} />);

    expect(screen.getByRole('link', { name: c.all })).toHaveAttribute('href', '/books/mine');
    expect(screen.getByRole('link', { name: c.orderAnother })).toHaveAttribute('href', '/books');
  });

  it('shows the two most recent orders and leaves the rest to the history page', () => {
    render(
      <MyBookOrdersSection
        orders={[
          order({ id: 'a', createdAt: '2026-01-01T10:00:00.000Z', items: [line('الأقدم')] }),
          order({ id: 'b', createdAt: '2026-02-01T10:00:00.000Z', items: [line('الأوسط')] }),
          order({ id: 'c', createdAt: '2026-03-01T10:00:00.000Z', items: [line('الأحدث')] }),
        ]}
        supportHref={SUPPORT}
      />,
    );

    expect(screen.getByText('الأحدث')).toBeInTheDocument();
    expect(screen.getByText('الأوسط')).toBeInTheDocument();
    expect(screen.queryByText('الأقدم')).not.toBeInTheDocument();
  });
});

function line(titleAr: string) {
  return {
    bookId: null,
    titleAr,
    unitPriceCents: 25000,
    quantity: 1,
    forGeneral: null,
    forLanguages: null,
  };
}
