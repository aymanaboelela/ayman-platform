import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { BookOrder } from '@ayman/contracts/book-orders';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
    path === '/api/taxonomy' ? { governorates: [], pinnedGovernorateCodes: [], systems: [] } : stored,
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
