import { describe, expect, it, jest } from '@jest/globals';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ExpensesService } from './expenses.service';

/**
 * «صرفت كام» on the expenses screen — the folding and ordering the service does
 * on top of Prisma's groups. The SQL side is Prisma's own `groupBy`; what can
 * go wrong here is ours: days landing in the wrong month, or the breakdowns
 * filtered by the very picker they feed.
 */
function serviceWith(groups: {
  byCategory: { category: string; _sum: { amountCents: number | null }; _count: { _all: number } }[];
  byDay: { occurredOn: Date; _sum: { amountCents: number | null }; _count: { _all: number } }[];
  total: number | null;
  count: number;
}) {
  const groupBy = jest.fn((args: { by: string[] }) =>
    Promise.resolve(args.by[0] === 'category' ? groups.byCategory : groups.byDay),
  );
  const tx = {
    expense: {
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(groups.count)),
      aggregate: jest.fn(() => Promise.resolve({ _sum: { amountCents: groups.total } })),
      groupBy,
    },
  };
  const prisma = {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return { service: new ExpensesService(prisma, {} as AuditService), groupBy };
}

const day = (iso: string, amountCents: number, count = 1) => ({
  occurredOn: new Date(`${iso}T00:00:00.000Z`),
  _sum: { amountCents },
  _count: { _all: count },
});

describe('expense list summary', () => {
  it('folds days into months, newest first, summing amounts and counts', async () => {
    const { service } = serviceWith({
      byCategory: [],
      byDay: [
        day('2026-10-30', 390_000),
        day('2026-10-03', 500_000, 2),
        day('2026-09-28', 407_500),
        // The last day of a month stays in it — the UTC parts, not local time.
        day('2026-09-30', 100),
      ],
      total: 0,
      count: 0,
    });

    const { summary } = await service.list({ page: 1, perPage: 100, q: '' });

    expect(summary.byMonth).toEqual([
      { month: '2026-10', amountCents: 890_000, count: 3 },
      { month: '2026-09', amountCents: 407_600, count: 2 },
    ]);
  });

  it('orders categories by money, largest first', async () => {
    const { service } = serviceWith({
      byCategory: [
        { category: 'charity', _sum: { amountCents: 1_000_000 }, _count: { _all: 2 } },
        { category: 'other', _sum: { amountCents: null }, _count: { _all: 0 } },
        { category: 'equipment', _sum: { amountCents: 3_800_000 }, _count: { _all: 1 } },
      ],
      byDay: [],
      total: 4_800_000,
      count: 3,
    });

    const { summary } = await service.list({ page: 1, perPage: 100, q: '' });

    expect(summary.totalCents).toBe(4_800_000);
    expect(summary.count).toBe(3);
    expect(summary.byCategory.map((entry) => entry.category)).toEqual([
      'equipment',
      'charity',
      'other',
    ]);
    expect(summary.byCategory[2]).toEqual({ category: 'other', amountCents: 0, count: 0 });
  });

  /*
   * Each picker's breakdown must ignore its OWN filter, or selecting «أكتوبر»
   * would leave a month list with only October in it, and selecting «صدقات» a
   * category grid with only صدقات.
   */
  it('drops the category filter from byCategory and the month filter from byMonth', async () => {
    const { service, groupBy } = serviceWith({ byCategory: [], byDay: [], total: 0, count: 0 });

    await service.list({
      page: 1,
      perPage: 100,
      q: 'شحن',
      category: 'shipping',
      month: '2026-10',
    });

    const calls = groupBy.mock.calls.map(
      ([args]) => args as unknown as { by: string[]; where: Record<string, unknown> },
    );
    const byCategory = calls.find((args) => args.by[0] === 'category');
    const byDay = calls.find((args) => args.by[0] === 'occurredOn');

    expect(byCategory?.where).not.toHaveProperty('category');
    expect(byCategory?.where).toHaveProperty('occurredOn');
    expect(byCategory?.where).toHaveProperty('titleAr');
    expect(byDay?.where).not.toHaveProperty('occurredOn');
    expect(byDay?.where).toHaveProperty('category', 'shipping');
    expect(byDay?.where).toHaveProperty('titleAr');
  });
});
