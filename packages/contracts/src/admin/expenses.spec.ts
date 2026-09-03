import { describe, expect, it } from 'vitest';
import {
  AdminExpenseCreateSchema,
  AdminExpensePatchSchema,
  AdminExpenseQuerySchema,
} from './expenses';

const valid = () => ({
  occurredOn: '2026-10-03',
  category: 'filming' as const,
  amountCents: 150_000,
  titleAr: 'يوم تصوير استوديو',
});

describe('AdminExpenseCreateSchema', () => {
  it('accepts a plain expense with no book', () => {
    const parsed = AdminExpenseCreateSchema.parse(valid());
    expect(parsed.bookId).toBeNull();
    expect(parsed.quantity).toBeNull();
  });

  it('accepts a print run that names a book and a count', () => {
    const parsed = AdminExpenseCreateSchema.parse({
      ...valid(),
      category: 'printing',
      bookId: '019fe000-0000-7000-8000-000000000001',
      quantity: 500,
    });
    expect(parsed.quantity).toBe(500);
  });

  it('refuses a book with no quantity, so the CHECK is met as a field error', () => {
    // `expenses_book_needs_quantity` would refuse this row anyway — as a 500
    // the admin cannot act on. A row naming a book with no count cannot say
    // what it bought.
    const result = AdminExpenseCreateSchema.safeParse({
      ...valid(),
      bookId: '019fe000-0000-7000-8000-000000000001',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['quantity']);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
  ])('refuses a %s amount', (_label, amountCents) => {
    // A zero is a row nobody meant to write; a negative is a refund, which is
    // its own thing and not a minus sign that silently flips every SUM.
    expect(AdminExpenseCreateSchema.safeParse({ ...valid(), amountCents }).success).toBe(false);
  });

  it('refuses a blank title', () => {
    expect(AdminExpenseCreateSchema.safeParse({ ...valid(), titleAr: '  ' }).success).toBe(false);
  });

  it('refuses a timestamp where a date belongs', () => {
    // The column is a DATE. Accepting a timestamp here is how a timezone bug
    // gets into a figure that is only ever bucketed by month.
    expect(
      AdminExpenseCreateSchema.safeParse({ ...valid(), occurredOn: '2026-10-03T00:00:00Z' }).success,
    ).toBe(false);
  });
});

describe('AdminExpensePatchSchema', () => {
  it('writes nothing the caller did not send', () => {
    // The defect this guards: a shape carrying `.default(null)` turns a
    // "partial" patch into one that nulls fields nobody touched — renaming an
    // expense would clear the book it was linked to.
    const parsed = AdminExpensePatchSchema.parse({ titleAr: 'اسم جديد' });
    expect(Object.keys(parsed)).toEqual(['titleAr']);
  });

  it('still refuses a book with no quantity', () => {
    expect(
      AdminExpensePatchSchema.safeParse({ bookId: '019fe000-0000-7000-8000-000000000001' }).success,
    ).toBe(false);
  });

  it('allows unlinking a book outright', () => {
    const parsed = AdminExpensePatchSchema.parse({ bookId: null, quantity: null });
    expect(parsed.bookId).toBeNull();
  });
});

describe('AdminExpenseQuerySchema', () => {
  it('accepts a YYYY-MM month', () => {
    expect(AdminExpenseQuerySchema.parse({ month: '2026-10' }).month).toBe('2026-10');
  });

  it.each(['2026-13', '2026-0', '26-10', '2026-10-03'])('refuses %s', (month) => {
    expect(AdminExpenseQuerySchema.safeParse({ month }).success).toBe(false);
  });
});
