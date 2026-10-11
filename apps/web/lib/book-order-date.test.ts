import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookOrderDate } from '@ayman/contracts/book-orders';

/**
 * «اي تاريخ مكتوب يبقى تاريخ الدفع … ومش عاوز ده يحصل تاني».
 *
 * A book order's row is created when the address form is saved, and a student
 * can sit on it for weeks before paying. Every date the desk reads — the card,
 * the packing sheet, the shipping card on the parcel — printed `createdAt`, so
 * an order paid yesterday went out stamped three weeks old.
 *
 * The rule is `bookOrderDate`. This file holds it: the helper says what it
 * says, and nothing on those screens reads an order's `createdAt` directly.
 */
describe('bookOrderDate', () => {
  it('is the day it was paid', () => {
    expect(
      bookOrderDate({ paidAt: '2026-10-05T10:00:00.000Z', createdAt: '2026-09-15T10:00:00.000Z' }),
    ).toBe('2026-10-05T10:00:00.000Z');
  });

  it('falls back to the day it was started only when it never paid', () => {
    expect(bookOrderDate({ paidAt: null, createdAt: '2026-09-15T10:00:00.000Z' })).toBe(
      '2026-09-15T10:00:00.000Z',
    );
  });
});

const ROOTS = ['app/(admin)/admin/books', 'components/dashboard/my-book-orders-section.tsx'];

function files(path: string): string[] {
  const full = join(process.cwd(), path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

describe('no book-order screen prints createdAt', () => {
  it.each(ROOTS.flatMap(files).filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.test.tsx')))(
    '%s',
    (file) => {
      // `row.createdAt`, `line.createdAt`, `label.createdAt`, `order.createdAt`
      // — the order objects these screens render. Use `bookOrderDate(…)`.
      expect(readFileSync(file, 'utf8')).not.toMatch(/\b(row|line|label|order)\.createdAt\b/);
    },
  );
});
