import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BookOrder } from '@ayman/contracts/book-orders';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiPost } from '@/lib/api';
import { BookOrderPanel } from './book-order-panel';

/**
 * «طالب كتابين ومكتوب ٣٠٠» — the shop's basket reopening an order for a
 * DIFFERENT basket. The key it is remembered under is one key for every basket,
 * so an order given an address at ×1 was resumed, at payment, under a ×2 basket.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const BOOK = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

// The order this browser remembers: ONE copy, address given, never paid.
const stored = {
  id: ORDER_ID,
  items: [{ bookId: BOOK, titleAr: 'كتاب تانية بكالوريا برمجة لغات', unitPriceCents: 15000, quantity: 1 }],
  amountCents: 30000,
  itemsCents: 15000,
  shippingCents: 15000,
  discountCents: 0,
  status: 'address_only',
  fullName: 'طالب تجربة',
  phone: '+201000000000',
  altPhone: '+201000000001',
  governorateCode: 'RS',
  city: 'الغردقة',
  addressStreet: 'شارع تجربة',
  addressBuilding: null,
  addressNote: null,
  senderPhone: null,
  paidAt: null,
  printedAt: null,
  shippedAt: null,
} as unknown as BookOrder;

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiGet: vi.fn(async (path: string) =>
    path === '/api/taxonomy'
      ? {
          // One governorate, so the address form has something to pick. «RS»
          // (the stored order's) is deliberately NOT in it — the resume tests
          // below never needed it to be.
          governorates: [{ code: '25', nameAr: 'أسيوط', slug: 'assiut', region: 'upper', sortOrder: 1 }],
          pinnedGovernorateCodes: [],
          systems: [],
        }
      : stored,
  ),
  apiPost: vi.fn(),
}));

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderBasket(copies: number) {
  localStorage.setItem('ayman:book-order:cart', ORDER_ID);
  render(
    <BookOrderPanel
      items={[{ bookId: BOOK, quantity: copies }]}
      itemsCents={15000 * copies}
      shippingRates={{ cairo_giza: 15000, delta: 15000, far: 15000 }}
      instapay={null}
      vodafoneCash="+201021196367"
      onCancel={() => undefined}
    />,
  );
}

describe('BookOrderPanel — the remembered basket order', () => {
  it('resumes it at payment when the basket is the same', async () => {
    renderBasket(1);
    expect(await screen.findByText('300 جنيه')).toBeTruthy();
    expect(screen.queryByDisplayValue('طالب تجربة')).toBeNull();
  });

  it('does NOT resume a ×1 order under a ×2 basket — the address form, prefilled, instead', async () => {
    renderBasket(2);
    expect(await screen.findByDisplayValue('طالب تجربة')).toBeTruthy();
    // The old order's frozen total is nowhere on screen.
    await waitFor(() => expect(screen.queryByText('300 جنيه')).toBeNull());
  });
});

/**
 * The redesigned address step. The checks are the same eight in the same order
 * with the same words; what changed is that each failing field says so under
 * itself — and, as before, nothing is sent until every one passes.
 */
describe('BookOrderPanel — the address step', () => {
  function renderFresh() {
    render(
      <BookOrderPanel
        items={[{ bookId: BOOK, quantity: 1 }]}
        summaryLines={[{ title: 'كتاب تانية بكالوريا برمجة لغات', quantity: 1, unitCents: 15000 }]}
        itemsCents={15000}
        shippingRates={{ cairo_giza: 8000, delta: 10000, far: 15000 }}
        instapay={null}
        vodafoneCash="+201021196367"
        onCancel={() => undefined}
      />,
    );
  }

  it('names every missing field under itself, and sends nothing', async () => {
    vi.mocked(apiPost).mockClear();
    renderFresh();
    fireEvent.click(await screen.findByRole('button', { name: copy.bookOrder.addressSubmit }));

    for (const message of [
      copy.bookOrder.fullNameRequired,
      copy.bookOrder.phoneRequired,
      copy.bookOrder.altPhoneRequired,
      copy.bookOrder.governorateRequired,
      copy.bookOrder.cityRequired,
      copy.bookOrder.addressStreetRequired,
    ]) {
      expect(screen.getByText(message)).toBeTruthy();
    }
    // The first wrong field is where the cursor goes.
    expect(document.activeElement?.id).toBe('book-order-full-name');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('says which delivery zone the picked governorate is in', async () => {
    renderFresh();
    const select = await screen.findByLabelText(copy.bookOrder.governorateLabel);
    await screen.findByRole('option', { name: 'أسيوط' });
    fireEvent.change(select, { target: { value: '25' } });

    expect(
      screen.getByText(formatCopy(copy.bookOrder.zoneHint, { zone: copy.books.shippingZoneFar })),
    ).toBeTruthy();
    // …and the summary's «الشحن» row names the same zone.
    expect(screen.getByText(copy.books.shippingZoneFar)).toBeTruthy();
  });
});
