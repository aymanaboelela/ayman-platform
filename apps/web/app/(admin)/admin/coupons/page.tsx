import Form from 'next/form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Ban,
  CalendarClock,
  CalendarX2,
  CircleCheckBig,
  Hourglass,
  Search,
  TicketPercent,
  Tickets,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  AdminCouponListSchema,
  AdminCouponStatusSchema,
  type AdminCouponRow,
  type AdminCouponStatus,
} from '@ayman/contracts/admin/coupons';
import { AdminUnlockCourseOptionsSchema } from '@ayman/contracts/admin/unlock-codes';
import { adminCouponsCopy as c } from '@ayman/contracts/copy/admin-coupons';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { formatEGP } from '@/lib/price';
import { can, getSession } from '@/lib/session';
import { CouponForm } from './coupon-form';
import { CouponRowActions } from './coupon-row-actions';

export const metadata = { title: c.title };

/** One of the API's four page sizes — anything else is a 400. */
const PER_PAGE = 20;

const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});
const COUNT = (n: number) => n.toLocaleString('ar-EG-u-nu-latn');

/** One hue per status — the chip, the filter and the row's edge agree. */
const STATUS_META: Record<AdminCouponStatus, { icon: LucideIcon; hue: string }> = {
  active: { icon: CircleCheckBig, hue: 'var(--ok)' },
  inactive: { icon: Ban, hue: 'var(--color-fg-muted)' },
  scheduled: { icon: CalendarClock, hue: 'var(--info)' },
  expired: { icon: CalendarX2, hue: 'var(--warn)' },
  exhausted: { icon: Hourglass, hue: 'var(--err)' },
};

/** Washes mix in `oklab` — see `lib/neutral-mix-space.test.ts`. */
const tint = (hue: string, percent: number) => `color-mix(in oklab, ${hue} ${percent}%, var(--color-surface-1))`;

function discountLabel(row: AdminCouponRow): string {
  return row.kind === 'percent'
    ? formatCopy(c.percentLabel, { percent: String(row.percentOff ?? 0) })
    : formatCopy(c.fixedLabel, { amount: formatEGP(row.amountOffCents ?? 0) });
}

function windowLabel(row: AdminCouponRow): string {
  const parts: string[] = [];
  if (row.startsAt) parts.push(formatCopy(c.from, { date: DATE.format(new Date(row.startsAt)) }));
  if (row.endsAt) parts.push(formatCopy(c.until, { date: DATE.format(new Date(row.endsAt)) }));
  return parts.length > 0 ? parts.join(' · ') : c.noWindow;
}

/**
 * «كوبونات الخصم» — the totals, a code maker, and every code with what it
 * did. Every read is `adminGet` with the visitor's cookie: Nest's
 * `@RequireFeature('coupons')` + `payment:read` decide, not this page. The
 * entitlement check is only so a stack without the feature gets a 404 rather
 * than an error screen.
 */
export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  if (!(await getEntitlements()).coupons) notFound();

  const params = await searchParams;
  const status = AdminCouponStatusSchema.safeParse(params.status).data;
  const q = (params.q ?? '').trim().slice(0, 40);
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const query = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
  if (status) query.set('status', status);
  if (q) query.set('q', q);

  const [session, list, courses] = await Promise.all([
    getSession(),
    adminGet(`/api/admin/coupons?${query.toString()}`, AdminCouponListSchema),
    adminGet('/api/admin/unlock-codes/courses', AdminUnlockCourseOptionsSchema),
  ]);
  const canWrite = can(session, 'payment:review');
  const pages = Math.max(1, Math.ceil(list.rowCount / PER_PAGE));

  const href = (next: { status?: AdminCouponStatus; page?: number }) => {
    const out = new URLSearchParams();
    if (next.status) out.set('status', next.status);
    if (q) out.set('q', q);
    if (next.page && next.page > 1) out.set('page', String(next.page));
    const qs = out.toString();
    return `/admin/coupons${qs ? `?${qs}` : ''}`;
  };

  const tiles: { label: string; value: string; icon: LucideIcon; hue: string; ltr?: boolean }[] = [
    { label: c.statTotal, value: COUNT(list.stats.total), icon: Tickets, hue: 'var(--viz-4)' },
    { label: c.statActive, value: COUNT(list.stats.active), icon: CircleCheckBig, hue: 'var(--viz-6)' },
    { label: c.statExpired, value: COUNT(list.stats.expired), icon: CalendarX2, hue: 'var(--viz-2)' },
    { label: c.statUses, value: COUNT(list.stats.uses), icon: TicketPercent, hue: 'var(--viz-5)' },
    {
      label: c.statGiven,
      value: `${formatEGP(list.stats.discountGivenCents)} ${c.currency}`,
      icon: Wallet,
      hue: 'var(--viz-1)',
    },
  ];

  return (
    <>
      <header className="mb-6 flex items-start gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: 'linear-gradient(135deg, var(--viz-4), var(--viz-1))' }}
          aria-hidden="true"
        >
          <TicketPercent className="size-6" />
        </span>
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="rounded-lg border p-4"
              style={{ borderColor: tint(tile.hue, 40), background: tint(tile.hue, 10) }}
            >
              <Icon className="mb-2 size-5" style={{ color: tile.hue }} aria-hidden="true" />
              <p className="text-[length:var(--fs-title-3)] font-bold text-fg">{tile.value}</p>
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{tile.label}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <section className="rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="me-auto text-[length:var(--fs-title-3)] font-semibold text-fg">{c.listTitle}</h2>
            <Form action="/admin/coupons" className="flex items-center gap-1.5">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <label className="flex items-center gap-1.5 rounded-md border border-line-subtle bg-surface-1 px-2">
                <Search className="size-4 text-fg-muted" aria-hidden="true" />
                <input
                  name="q"
                  defaultValue={q}
                  dir="ltr"
                  placeholder={c.searchPlaceholder}
                  aria-label={c.searchPlaceholder}
                  className="mono h-9 w-36 bg-transparent text-fg outline-none"
                />
              </label>
            </Form>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link href={href({})} className={cn('chip', !status && 'chip--solid')}>
              {c.filterAll}
            </Link>
            {AdminCouponStatusSchema.options.map((option) => (
              <Link key={option} href={href({ status: option })} className={cn('chip', status === option && 'chip--solid')}>
                {c.status[option]}
              </Link>
            ))}
          </div>

          {list.rows.length === 0 ? (
            <p className="rounded-md bg-surface-1 p-6 text-center text-fg-muted">{c.empty}</p>
          ) : (
            <ul className="grid gap-2">
              {list.rows.map((row) => {
                const meta = STATUS_META[row.status];
                const Icon = meta.icon;
                return (
                  <li
                    key={row.id}
                    className="grid gap-3 rounded-md border border-line-subtle bg-surface-1 p-3"
                    style={{ borderInlineStartWidth: 4, borderInlineStartColor: meta.hue }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <bdi dir="ltr" className="mono text-[length:var(--fs-title-3)] font-bold text-fg">
                        {row.code}
                      </bdi>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--fs-text-xs)] font-semibold"
                        style={{ color: meta.hue, background: tint(meta.hue, 14) }}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {c.status[row.status]}
                      </span>
                      <span
                        className="rounded-full px-2.5 py-1 text-[length:var(--fs-text-xs)] font-semibold"
                        style={{ color: 'var(--viz-4)', background: tint('var(--viz-4)', 14) }}
                      >
                        {discountLabel(row)}
                      </span>
                    </div>
                    <dl className="grid gap-x-4 gap-y-1 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="sr-only">{c.scope}</dt>
                        <dd className="truncate text-fg-muted">
                          {row.allCourses ? c.allCourses : row.courses.map((course) => course.title).join('، ')}
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only">{c.startsAt}</dt>
                        <dd className="text-fg-muted">{windowLabel(row)}</dd>
                      </div>
                      <div>
                        <dt className="sr-only">{c.statUses}</dt>
                        <dd className="font-semibold text-fg">
                          {row.maxUses === null
                            ? formatCopy(c.usesUnlimited, { used: COUNT(row.usesCount) })
                            : formatCopy(c.uses, { used: COUNT(row.usesCount), max: COUNT(row.maxUses) })}
                          {row.maxUsesPerStudent !== null ? (
                            <span className="font-normal text-fg-muted">
                              {' · '}
                              {formatCopy(c.perStudent, { max: COUNT(row.maxUsesPerStudent) })}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only">{c.statGiven}</dt>
                        <dd className="text-fg-muted">{formatCopy(c.given, { amount: formatEGP(row.discountGivenCents) })}</dd>
                      </div>
                    </dl>
                    {row.note ? <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{row.note}</p> : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                        {row.createdBy ? formatCopy(c.createdBy, { name: row.createdBy.name }) : null}
                        {row.createdBy ? ' · ' : null}
                        {DATE.format(new Date(row.createdAt))}
                      </p>
                      <CouponRowActions coupon={row} canWrite={canWrite} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pages > 1 ? (
            <nav className="mt-4 flex items-center justify-between gap-2">
              {page > 1 ? (
                <Link href={href({ status, page: page - 1 })} className="chip">
                  {c.prev}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
                {formatCopy(c.pageOf, { page: String(page), pages: String(pages) })}
              </span>
              {page < pages ? (
                <Link href={href({ status, page: page + 1 })} className="chip">
                  {c.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>

        {canWrite ? (
          <aside className="rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5">
            <h2 className="mb-4 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.createTitle}</h2>
            <CouponForm courses={courses.items} />
          </aside>
        ) : null}
      </div>
    </>
  );
}
