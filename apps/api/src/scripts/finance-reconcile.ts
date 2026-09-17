/**
 * تسوية «النظرة العامة» — a ONE-OFF that rewrites the money side of
 * `/admin/finance` to the figures Ayman reconciled on paper (2026-09-09).
 *
 * ## Why a script and not the admin API
 *
 * The same four changes are all reachable through `/api/admin/*`, and doing
 * them by hand through the UI is what produced the mismatch this fixes: the
 * expense ledger, the two comped subscriptions and the book orders are three
 * screens, and «صرفت كام ودخلي كام» only balances when all three move
 * together. In here they are ONE transaction — the overview is never
 * observable half-reconciled, and a failure at order 19 of 40 leaves nothing
 * behind to undo by hand.
 *
 * ## What it does
 *
 *   1. Deletes every `Expense` row and inserts `EXPENSES` below (12,782 ج).
 *   2. Zeroes the owner's own test subscriptions — `amountCents = 0`,
 *      `isFree = true`, the exact pair `FinanceService.editAmount` writes, so
 *      they leave `subscriptionRevenueCents` the way a comped term does.
 *   3. Soft-deletes every book order currently inside `BOOK_REVENUE_WHERE`,
 *      which is what takes the book money out of the totals. Soft, and with a
 *      reason — `POST /api/admin/book-orders/:id/restore` puts any of them
 *      back, and the shipping history is not destroyed to move a number.
 *   4. Writes one `audit_log` row per change, on the real hash chain.
 *
 * ## ⚠️ It is a DRY RUN unless you pass `--apply`
 *
 * Without the flag it does all of the above, prints the resulting overview,
 * and then rolls the transaction back — the pattern this repo already uses to
 * prove a migration on live data. So the numbers you read in a dry run are the
 * numbers you get, computed by `FinanceOverviewService` itself rather than by
 * a second implementation in this file that could disagree with the screen.
 *
 *   docker exec -w /app/apps/api <api-container> node dist/scripts/finance-reconcile.js
 *   docker exec -w /app/apps/api <api-container> node dist/scripts/finance-reconcile.js --apply
 *
 * ⚠️ Lives under `src/` and not `prisma/` for the reason `create-admin.ts`
 * spells out: only `src/**` is compiled and only `dist/` ships in the image.
 */
import 'dotenv/config';
import { PrismaClient, type Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuditService } from '../audit/audit.service';
import { AUDIT_RESOURCES } from '../modules/admin/admin.constants';
import { BOOK_REVENUE_WHERE } from '../modules/book-orders/book-revenue';
import { FinanceOverviewService } from '../modules/expenses/finance-overview.service';
import type { PrismaService } from '../prisma/prisma.service';

const APPLY = process.argv.includes('--apply');

/** The date every reconciled expense is stamped with. All fourteen land in one
 *  month deliberately — the paper list carries no per-item dates, and inventing
 *  them would put made-up numbers in the monthly trend. */
const OCCURRED_ON = new Date(Date.UTC(2026, 8, 9));

/** How the owner's own accounts are recognised. Matched on `User.name`, and
 *  the script REFUSES to run if the match count is not `EXPECTED_TEST_SUBS` —
 *  a rename or a namesake student must stop this, not silently zero somebody
 *  else's paid subscription. */
const TEST_SUBSCRIBER_NAME = 'أيمن أبو الع';
const EXPECTED_TEST_SUBS = 2;

/** المصروفات، بالجنيه. Sums to `TARGET_EXPENSES_EGP` and the script asserts it. */
const EXPENSES: ReadonlyArray<{
  titleAr: string;
  category: Prisma.ExpenseCreateInput['category'];
  egp: number;
  noteAr?: string;
}> = [
  { titleAr: 'تصوير استوديو', category: 'filming', egp: 2100 },
  { titleAr: 'قلم سبورة وقلم تابلت', category: 'equipment', egp: 1000 },
  { titleAr: 'أوبر', category: 'other', egp: 250 },
  { titleAr: 'أوبر', category: 'other', egp: 355 },
  { titleAr: 'وصلات', category: 'equipment', egp: 50 },
  {
    titleAr: 'شحن الكتب بالبريد',
    category: 'other',
    egp: 2207,
    noteAr: 'شحن ٢٥ أوردر كتاب عن طريق البريد — حق الشحن بس',
  },
  { titleAr: 'عمولة تحويل', category: 'services', egp: 30 },
  { titleAr: 'بند متفرقات', category: 'other', egp: 100 },
  { titleAr: 'توك توك', category: 'other', egp: 10 },
  { titleAr: 'بانر غلاف الكتاب', category: 'marketing', egp: 500 },
  { titleAr: 'السبورة', category: 'equipment', egp: 850 },
  { titleAr: 'طباعة الكتب', category: 'printing', egp: 4680, noteAr: 'اتدفعت للمطبعة' },
  { titleAr: 'الدومين', category: 'services', egp: 500 },
  { titleAr: 'ستيكرز', category: 'marketing', egp: 150 },
];

const TARGET_EXPENSES_EGP = 12_782;
/** What Ayman counted as the money that actually reached the platform. Not
 *  enforced — the script REPORTS the gap rather than bending a figure to hit
 *  it, because a total that was made to match proves nothing. */
const TARGET_NET_REVENUE_EGP = 49_950;

const DELETION_REASON = 'تسوية حسابات 2026-09-09 — اتشالت من الحسبة لغاية ما الأرقام تتظبط';

const egp = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Rolls a dry run back without pretending it failed. */
class DryRun extends Error {}

/**
 * The audit trail for this run.
 *
 * ⚠️ Goes through `AuditService.recordTx` and NEVER writes `audit_log`
 * directly — `only-the-service-writes.spec.ts` forbids the direct insert, and
 * it is right to: a row whose `prevHash` is computed anywhere but in that one
 * method breaks `verifyChain` from that point on permanently, and the table is
 * INSERT-only for the runtime role so nothing can repair it. `recordTx` is the
 * supported way to get an audit row inside a transaction the caller opened.
 *
 * The service is constructed by hand rather than pulled out of a Nest context:
 * it takes one dependency, and booting the whole application graph to write
 * fourteen rows would drag every module's `onModuleInit` along with it.
 */
const audit = new AuditService(prisma as unknown as PrismaService);

function report(label: string, o: Awaited<ReturnType<FinanceOverviewService['overview']>>): void {
  console.log(`\n── ${label} ──`);
  const line = (k: string, v: number) => console.log(`  ${k.padEnd(16)}${egp(v).padStart(12)} ج`);
  line('اشتراكات', o.subscriptionRevenueCents);
  line('كتب', o.bookRevenueCents);
  line('إجمالي الدخل', o.revenueTotalCents);
  line('مرتجعات', o.refundsTotalCents);
  line('صافي الدخل', o.netRevenueTotalCents);
  line('مصروفات', o.expensesTotalCents);
  line('الصــافي', o.netCents);
  for (const c of o.expensesByCategory) {
    console.log(`      · ${c.category.padEnd(12)}${egp(c.amountCents).padStart(10)} ج`);
  }
}

async function main(): Promise<void> {
  const planned = EXPENSES.reduce((sum, e) => sum + e.egp, 0);
  if (planned !== TARGET_EXPENSES_EGP) {
    throw new Error(`المصروفات مجموعها ${planned} مش ${TARGET_EXPENSES_EGP} — اظبط القايمة الأول`);
  }

  const actor = await prisma.user.findFirst({
    where: { role: 'admin' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true },
  });
  if (!actor) throw new Error('مفيش أدمن في الداتابيز — مش هينفع أكتب audit من غير actor');

  const before = await new FinanceOverviewService(prisma as unknown as PrismaService).overview();
  report('قبل', before);

  try {
    await prisma.$transaction(
      async (tx) => {
        /* ── 1. المصروفات ─────────────────────────────────────────────────── */
        const oldExpenses = await tx.expense.findMany({
          select: { id: true, titleAr: true, amountCents: true, category: true, occurredOn: true },
        });
        for (const row of oldExpenses) {
          await tx.expense.delete({ where: { id: row.id } });
          await audit.recordTx(tx, {
            actorUserId: actor.id,
            outcome: 'success',
            action: 'expense:delete',
            resourceType: AUDIT_RESOURCES.expense,
            resourceId: row.id,
            metadata: { reconcile: '2026-09-09', titleAr: row.titleAr, amountCents: row.amountCents },
          });
        }
        console.log(`\nمسحت ${oldExpenses.length} بند مصروفات قديم`);

        for (const e of EXPENSES) {
          const created = await tx.expense.create({
            data: {
              occurredOn: OCCURRED_ON,
              category: e.category,
              amountCents: e.egp * 100,
              titleAr: e.titleAr,
              noteAr: e.noteAr ?? null,
              createdBy: actor.id,
            },
            select: { id: true },
          });
          await audit.recordTx(tx, {
            actorUserId: actor.id,
            outcome: 'success',
            action: 'expense:create',
            resourceType: AUDIT_RESOURCES.expense,
            resourceId: created.id,
            metadata: { reconcile: '2026-09-09', titleAr: e.titleAr, amountCents: e.egp * 100 },
          });
        }
        console.log(`ضفت ${EXPENSES.length} بند بإجمالي ${planned.toLocaleString('en-US')} ج`);

        /* ── 2. الاشتراكات التجريبية ──────────────────────────────────────── */
        const testSubs = await tx.paymentSubmission.findMany({
          where: {
            status: 'approved',
            isFree: false,
            user: { name: { contains: TEST_SUBSCRIBER_NAME } },
          },
          select: { id: true, amountCents: true, isFree: true, user: { select: { name: true } } },
        });
        if (testSubs.length !== EXPECTED_TEST_SUBS) {
          throw new Error(
            `لقيت ${testSubs.length} اشتراك باسم «${TEST_SUBSCRIBER_NAME}» والمتوقع ${EXPECTED_TEST_SUBS} — ` +
              'وقفت من غير ما أغيّر حاجة عشان ما صفّرش اشتراك حد دافع',
          );
        }
        for (const sub of testSubs) {
          await tx.paymentSubmission.update({
            where: { id: sub.id },
            data: { amountCents: 0, isFree: true },
          });
          await audit.recordTx(tx, {
            actorUserId: actor.id,
            outcome: 'success',
            action: 'payment:finance-edit-amount',
            resourceType: AUDIT_RESOURCES.paymentSubmission,
            resourceId: sub.id,
            metadata: {
              reconcile: '2026-09-09',
              reason: 'اشتراك تجريبي بتاع صاحب المنصة — مش فلوس حقيقية',
              before: { amountCents: sub.amountCents, isFree: sub.isFree },
              after: { amountCents: 0, isFree: true },
            },
          });
          console.log(`صفّرت اشتراك تجريبي: ${sub.user?.name} — كان ${egp(sub.amountCents)} ج`);
        }

        /* ── 3. فلوس الكتب ────────────────────────────────────────────────── */
        const orders = await tx.bookOrder.findMany({
          where: BOOK_REVENUE_WHERE,
          select: { id: true, amountCents: true, status: true },
        });
        for (const order of orders) {
          await tx.bookOrder.update({
            where: { id: order.id },
            data: {
              deletedAt: new Date(),
              deletedByUserId: actor.id,
              deletionReason: DELETION_REASON,
            },
          });
          await audit.recordTx(tx, {
            actorUserId: actor.id,
            outcome: 'success',
            action: 'book-order:delete',
            resourceType: AUDIT_RESOURCES.bookOrder,
            resourceId: order.id,
            metadata: {
              reconcile: '2026-09-09',
              reason: DELETION_REASON,
              amountCents: order.amountCents,
              status: order.status,
            },
          });
        }
        console.log(
          `شيلت ${orders.length} أوردر كتاب من الحسبة ` +
            `(${egp(orders.reduce((s, o) => s + o.amountCents, 0))} ج) — يرجعوا بـ restore`,
        );

        /* ── 4. التقرير، محسوب بنفس الخدمة اللي الشاشة بتقراها ────────────── */
        const after = await new FinanceOverviewService(
          tx as unknown as PrismaService,
        ).overview();
        report(APPLY ? 'بعد' : 'بعد (تجربة — هيترجع)', after);

        const net = after.netRevenueTotalCents / 100;
        const diff = net - TARGET_NET_REVENUE_EGP;
        console.log(
          `\nصافي الدخل ${net.toLocaleString('en-US')} ج — المستهدف ` +
            `${TARGET_NET_REVENUE_EGP.toLocaleString('en-US')} ج → ` +
            (diff === 0 ? 'مطابق ✅' : `فرق ${diff.toLocaleString('en-US')} ج ⚠️`),
        );

        if (!APPLY) throw new DryRun();
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log('\n✅ اتحفظ.');
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    console.log('\n↩︎  تجربة بس — اترجع كل حاجة. زوّد --apply عشان تتحفظ.');
  }
}

main()
  .catch((error: unknown) => {
    console.error('❌', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
