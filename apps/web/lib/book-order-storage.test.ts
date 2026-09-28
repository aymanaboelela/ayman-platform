import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cartKeyOf,
  clearInProgressBookOrder,
  orderMatchesCart,
  readInProgressBookOrder,
  saveInProgressBookOrder,
} from './book-order-storage';

/**
 * ⚠️ A REAL `localStorage`, installed by hand — same shim `theme.test.ts`
 * uses, for the same reason: Node 22+ ships its own `localStorage` global
 * bound without a backing file on this runner, which shadows jsdom's and
 * leaves every method on it `undefined`.
 */
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
  localStorage.clear();
});

const courseA = '0192f000-0000-7000-8000-00000000000a';
const courseB = '0192f000-0000-7000-8000-00000000000b';
const orderId = '0192f000-0000-7000-8000-000000000001';

describe('book order storage', () => {
  it('returns null when nothing was ever saved for this course', () => {
    expect(readInProgressBookOrder(courseA)).toBeNull();
  });

  it('reads back exactly what was saved', () => {
    saveInProgressBookOrder(courseA, orderId);
    expect(readInProgressBookOrder(courseA)).toBe(orderId);
  });

  it('keeps different courses independent', () => {
    saveInProgressBookOrder(courseA, orderId);
    expect(readInProgressBookOrder(courseB)).toBeNull();
  });

  it('clears only the given course', () => {
    saveInProgressBookOrder(courseA, orderId);
    saveInProgressBookOrder(courseB, orderId);

    clearInProgressBookOrder(courseA);

    expect(readInProgressBookOrder(courseA)).toBeNull();
    expect(readInProgressBookOrder(courseB)).toBe(orderId);
  });

  it('clearing a course with nothing saved is a no-op, not a throw', () => {
    expect(() => clearInProgressBookOrder(courseA)).not.toThrow();
  });

  it('overwrites a previous in-progress order for the same course', () => {
    const secondOrderId = '0192f000-0000-7000-8000-000000000002';
    saveInProgressBookOrder(courseA, orderId);
    saveInProgressBookOrder(courseA, secondOrderId);
    expect(readInProgressBookOrder(courseA)).toBe(secondOrderId);
  });
});

describe('orderMatchesCart', () => {
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';

  it('is the same basket whatever the order of the lines', () => {
    const cart = cartKeyOf([
      { bookId: A, quantity: 1 },
      { bookId: B, quantity: 2 },
    ]);
    expect(orderMatchesCart([{ bookId: B, quantity: 2 }, { bookId: A, quantity: 1 }], cart)).toBe(true);
  });

  it('is NOT the same basket once a quantity changed — the ×1 order under a ×2 basket', () => {
    const cart = cartKeyOf([{ bookId: A, quantity: 2 }]);
    expect(orderMatchesCart([{ bookId: A, quantity: 1 }], cart)).toBe(false);
  });

  it('is NOT the same basket with a book added or removed', () => {
    const cart = cartKeyOf([{ bookId: A, quantity: 1 }]);
    expect(orderMatchesCart([{ bookId: A, quantity: 1 }, { bookId: B, quantity: 1 }], cart)).toBe(false);
    expect(orderMatchesCart([], cart)).toBe(false);
  });

  it('never matches a line whose book was deleted', () => {
    expect(orderMatchesCart([{ bookId: null, quantity: 1 }], cartKeyOf([{ bookId: A, quantity: 1 }]))).toBe(false);
  });
});
