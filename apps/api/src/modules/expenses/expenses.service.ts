import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminExpenseCreateInput,
  AdminExpenseList,
  AdminExpensePatchInput,
  AdminExpenseQuery,
  AdminExpenseRow,
  AdminExpenseSummary,
} from '@ayman/contracts/admin/expenses';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';

/** `YYYY-MM-DD` from a DATE column, without going through a timezone.
 *
 *  ⚠️ NOT `toISOString().slice(0, 10)`. Prisma hands a `@db.Date` back as a
 *  `Date` at UTC midnight; `toISOString` is then correct, but the same helper
 *  applied to any local-midnight Date would silently shift a day, and this
 *  function is the one every caller will reach for. Reading the UTC parts is
 *  right in both cases. */
function isoDate(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

/** The half-open `[first of month, first of next month)` window for `YYYY-MM`.
 *
 *  Half-open and not `BETWEEN`: an inclusive upper bound has to name the last
 *  day of the month, which is where February and the leap years live. */
function monthRange(month: string): { gte: Date; lt: Date } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return {
    gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
    lt: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

interface ExpenseRecord {
  id: string;
  occurredOn: Date;
  category: AdminExpenseRow['category'];
  amountCents: number;
  titleAr: string;
  noteAr: string | null;
  bookId: string | null;
  quantity: number | null;
  createdAt: Date;
  book: { titleAr: string } | null;
}

const EXPENSE_SELECT = {
  id: true,
  occurredOn: true,
  category: true,
  amountCents: true,
  titleAr: true,
  noteAr: true,
  bookId: true,
  quantity: true,
  createdAt: true,
  book: { select: { titleAr: true } },
} as const;

function toRow(row: ExpenseRecord): AdminExpenseRow {
  return {
    id: row.id,
    occurredOn: isoDate(row.occurredOn),
    category: row.category,
    amountCents: row.amountCents,
    titleAr: row.titleAr,
    noteAr: row.noteAr,
    bookId: row.bookId,
    bookTitleAr: row.book?.titleAr ?? null,
    quantity: row.quantity,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * المصروفات — the write side of the ledger's other half.
 *
 * Nothing here is derived or inferred: every row is something a human typed,
 * which is exactly why `titleAr` is required and `amountCents` is CHECKed above
 * zero in the database. A ledger that can hold an unlabelled zero is one nobody
 * can audit six months later.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminExpenseQuery): Promise<AdminExpenseList> {
    const byCategory: Prisma.ExpenseWhereInput = query.category
      ? { category: query.category }
      : {};
    const byMonth: Prisma.ExpenseWhereInput = query.month
      ? { occurredOn: monthRange(query.month) }
      : {};
    const bySearch: Prisma.ExpenseWhereInput = query.q
      ? { titleAr: { contains: query.q, mode: 'insensitive' } }
      : {};
    const where: Prisma.ExpenseWhereInput = { ...byCategory, ...byMonth, ...bySearch };

    // One transaction so the count, the page and the totals describe the same
    // table — separate round trips can straddle a write and report 21 rows
    // across 2 pages of 10, or a total that is not the sum of its categories.
    // Interactive rather than the array form only because the array form
    // erases `groupBy`'s result type.
    const [rows, rowCount, totals, categoryGroups, dayGroups] = await this.prisma.$transaction(
      (tx) =>
        Promise.all([
          tx.expense.findMany({
            where,
            // Newest SPEND first, tie-broken by id: `occurredOn` is a DATE, so a
            // day with three receipts has no order of its own and would otherwise
            // shuffle between requests — which makes pagination lose and repeat
            // rows, not merely look untidy.
            orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.perPage,
            take: query.perPage,
            select: EXPENSE_SELECT,
          }),
          tx.expense.count({ where }),
          tx.expense.aggregate({ where, _sum: { amountCents: true } }),
          tx.expense.groupBy({
            by: ['category'],
            where: { ...byMonth, ...bySearch },
            _sum: { amountCents: true },
            _count: { _all: true },
            orderBy: { category: 'asc' },
          }),
          // By DAY and folded into months below, rather than a `date_trunc` in raw
          // SQL: this way the month list is filtered by exactly the same `where`
          // the rows are, `q` included, with no second spelling of it to drift.
          // A ledger has a few hundred distinct days a year at most.
          tx.expense.groupBy({
            by: ['occurredOn'],
            where: { ...byCategory, ...bySearch },
            _sum: { amountCents: true },
            _count: { _all: true },
            orderBy: { occurredOn: 'desc' },
          }),
        ]),
    );

    const months = new Map<string, { amountCents: number; count: number }>();
    for (const day of dayGroups) {
      const month = isoDate(day.occurredOn).slice(0, 7);
      const entry = months.get(month) ?? { amountCents: 0, count: 0 };
      entry.amountCents += day._sum.amountCents ?? 0;
      entry.count += day._count._all;
      months.set(month, entry);
    }

    const summary: AdminExpenseSummary = {
      totalCents: totals._sum.amountCents ?? 0,
      count: rowCount,
      byCategory: categoryGroups
        .map((group) => ({
          category: group.category,
          amountCents: group._sum.amountCents ?? 0,
          count: group._count._all,
        }))
        .sort((a, b) => b.amountCents - a.amountCents),
      byMonth: [...months]
        .map(([month, entry]) => ({ month, ...entry }))
        .sort((a, b) => b.month.localeCompare(a.month)),
    };

    return { rows: rows.map(toRow), rowCount, summary };
  }

  async create(adminId: string, input: AdminExpenseCreateInput): Promise<AdminExpenseRow> {
    await this.assertBookExists(input.bookId);

    const created = await this.prisma.expense.create({
      data: {
        occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`),
        category: input.category,
        amountCents: input.amountCents,
        titleAr: input.titleAr,
        noteAr: input.noteAr,
        bookId: input.bookId,
        quantity: input.quantity,
        createdBy: adminId,
      },
      select: EXPENSE_SELECT,
    });

    await this.audit.record({
      action: 'expense:create',
      resourceType: AUDIT_RESOURCES.expense,
      resourceId: created.id,
      outcome: 'success',
      // The amount and the month, because those are the two facts that change
      // what «صافي الربح» says. The note is not: a receipt's full text in an
      // audit row is noise that also has to be redacted later.
      metadata: {
        adminId,
        amountCents: created.amountCents,
        category: created.category,
        occurredOn: isoDate(created.occurredOn),
      },
    });

    return toRow(created);
  }

  async update(id: string, input: AdminExpensePatchInput): Promise<AdminExpenseRow> {
    const existing = await this.prisma.expense.findUnique({
      where: { id },
      select: { id: true, amountCents: true, bookId: true, quantity: true },
    });
    if (!existing) throw new NotFoundException();

    if (input.bookId !== undefined) await this.assertBookExists(input.bookId);

    /*
     * ⚠️ The CHECK spans two columns, so a patch touching only ONE of them has
     * to be validated against the row it is landing on, not against itself.
     * `{ quantity: null }` alone on a row that names a book passes the
     * contract's own refine (which sees no `bookId`) and would then hit
     * `expenses_book_needs_quantity` as a 500.
     */
    const nextBookId = input.bookId !== undefined ? input.bookId : existing.bookId;
    const nextQuantity = input.quantity !== undefined ? input.quantity : existing.quantity;
    if (nextBookId !== null && nextQuantity === null) {
      throw new NotFoundException('quantity is required when an expense names a book');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(input.occurredOn !== undefined
          ? { occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`) }
          : {}),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.amountCents !== undefined && { amountCents: input.amountCents }),
        ...(input.titleAr !== undefined && { titleAr: input.titleAr }),
        ...(input.noteAr !== undefined && { noteAr: input.noteAr }),
        ...(input.bookId !== undefined && { bookId: input.bookId }),
        ...(input.quantity !== undefined && { quantity: input.quantity }),
      },
      select: EXPENSE_SELECT,
    });

    await this.audit.record({
      action: 'expense:update',
      resourceType: AUDIT_RESOURCES.expense,
      resourceId: id,
      outcome: 'success',
      // Both amounts, because "who changed this number and to what" is the
      // question this row exists to answer.
      metadata: { fromAmountCents: existing.amountCents, toAmountCents: updated.amountCents },
    });

    return toRow(updated);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.expense.findUnique({
      where: { id },
      select: { id: true, amountCents: true, titleAr: true },
    });
    if (!existing) throw new NotFoundException();

    await this.prisma.expense.delete({ where: { id } });

    await this.audit.record({
      action: 'expense:delete',
      resourceType: AUDIT_RESOURCES.expense,
      resourceId: id,
      outcome: 'success',
      // The row is gone, so the audit entry is the only remaining record of
      // what it said — hence the title and the amount, not just the id.
      metadata: { amountCents: existing.amountCents, titleAr: existing.titleAr },
    });

    return { ok: true };
  }

  /** A `bookId` that resolves to nothing would be caught by the FK as a 500;
   *  this makes it the 404 it actually is. */
  private async assertBookExists(bookId: string | null | undefined): Promise<void> {
    if (!bookId) return;
    const book = await this.prisma.book.findUnique({ where: { id: bookId }, select: { id: true } });
    if (!book) throw new NotFoundException('book not found');
  }
}
