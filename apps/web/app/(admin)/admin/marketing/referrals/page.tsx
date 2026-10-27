import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ban, BadgeCheck, Crown, Gift, Undo2, UserPlus, Wallet, XCircle } from 'lucide-react';
import {
  AdminReferralListSchema,
  ReferralProgramSchema,
  ReferralStatusSchema,
  TopReferrersSchema,
  type ReferralStatus,
} from '@ayman/contracts/admin/referrals';
import { adminReferralsCopy as c } from '@ayman/contracts/copy/admin-referrals';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { formatEGP } from '@/lib/price';
import { MarketingTabs } from '../tabs';
import { ReferralProgramForm } from './program-form';
import { VoidReferralButton } from './void-button';

export const metadata = { title: c.title };

const PER_PAGE = 20;

const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeZone: 'Africa/Cairo' });

/** One hue per status, used by the tile, the filter chip and the row's chip alike. */
const HUE: Record<ReferralStatus, string> = {
  joined: 'var(--viz-5)',
  credited: 'var(--viz-6)',
  reversed: 'var(--viz-1)',
  blocked: 'var(--err)',
  voided: 'var(--color-fg-muted)',
};

const ICON: Record<ReferralStatus, typeof Gift> = {
  joined: UserPlus,
  credited: BadgeCheck,
  reversed: Undo2,
  blocked: Ban,
  voided: XCircle,
};

const tint = (hue: string, percent: number) => `color-mix(in oklab, ${hue} ${percent}%, var(--color-surface-1))`;

/**
 * «التسويق ← دعوة الصحاب» — the program's settings, the totals, the students
 * who brought the most friends, and every referral with «إلغاء» on the ones
 * that can still be cancelled.
 *
 * Every read is `adminGet` (no-store) with the visitor's cookie: Nest's
 * `@RequireFeature('referrals')` + `marketing:read` decide, not this page. The
 * entitlement check here is only so a stack without the feature gets a 404
 * instead of an error screen.
 */
export default async function MarketingReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  if (!(await getEntitlements()).referrals) notFound();

  const params = await searchParams;
  const status = ReferralStatusSchema.safeParse(params.status).data;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const query = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
  if (status) query.set('status', status);

  const [program, list, top] = await Promise.all([
    adminGet('/api/admin/referrals/program', ReferralProgramSchema),
    adminGet(`/api/admin/referrals?${query.toString()}`, AdminReferralListSchema),
    adminGet('/api/admin/referrals/top', TopReferrersSchema),
  ]);
  const pages = Math.max(1, Math.ceil(list.rowCount / PER_PAGE));

  const tiles = [
    { key: 'joined' as const, label: c.totalsJoined, value: list.totals.joined },
    { key: 'credited' as const, label: c.totalsCredited, value: list.totals.credited },
    { key: 'reversed' as const, label: c.totalsReversed, value: list.totals.reversed },
    { key: 'blocked' as const, label: c.totalsBlocked, value: list.totals.blocked },
    { key: 'voided' as const, label: c.totalsVoided, value: list.totals.voided },
  ];

  const href = (next: { status?: ReferralStatus; page?: number }) => {
    const out = new URLSearchParams();
    if (next.status) out.set('status', next.status);
    if (next.page && next.page > 1) out.set('page', String(next.page));
    const qs = out.toString();
    return `/admin/marketing/referrals${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <MarketingTabs />

      <header className="mb-6 flex items-start gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: 'linear-gradient(135deg, var(--viz-4), var(--viz-3))' }}
          aria-hidden="true"
        >
          <Gift className="size-6" />
        </span>
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div
          className="col-span-2 rounded-lg border p-4 md:col-span-3 xl:col-span-1"
          style={{ borderColor: tint('var(--viz-1)', 45), background: tint('var(--viz-1)', 14) }}
        >
          <Wallet className="mb-2 size-5" style={{ color: 'var(--viz-1)' }} aria-hidden="true" />
          <p className="text-[length:var(--fs-title-3)] font-bold text-fg">
            <span dir="ltr">{formatEGP(list.totals.creditedCents)}</span> {c.currency}
          </p>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.totalsCreditedCents}</p>
        </div>
        {tiles.map((tile) => {
          const Icon = ICON[tile.key];
          return (
            <Link
              key={tile.key}
              href={href({ status: status === tile.key ? undefined : tile.key })}
              className={cn('rounded-lg border p-4 transition-transform duration-150 hover:-translate-y-px', status === tile.key && 'ring-2')}
              style={{ borderColor: tint(HUE[tile.key], 40), background: tint(HUE[tile.key], 10) }}
            >
              <Icon className="mb-2 size-5" style={{ color: HUE[tile.key] }} aria-hidden="true" />
              <p className="text-[length:var(--fs-title-3)] font-bold text-fg">{tile.value.toLocaleString('ar-EG-u-nu-latn')}</p>
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{tile.label}</p>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="me-auto text-[length:var(--fs-title-3)] font-semibold text-fg">{c.listTitle}</h2>
            <Link href={href({})} className={cn('chip', !status && 'chip--solid')}>
              {c.filterAll}
            </Link>
            {ReferralStatusSchema.options.map((option) => (
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
                const Icon = ICON[row.status];
                const hue = HUE[row.status];
                return (
                  <li
                    key={row.id}
                    className="grid gap-3 rounded-md border border-line-subtle bg-surface-1 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                    style={{ borderInlineStartWidth: 4, borderInlineStartColor: hue }}
                  >
                    <div className="min-w-0">
                      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.colReferrer}</p>
                      <Link href={`/admin/students/${encodeURIComponent(row.referrer.id)}`} className="block truncate font-semibold text-fg hover:underline">
                        {row.referrer.name}
                      </Link>
                      {row.referrer.phone ? (
                        <p className="mono text-[length:var(--fs-text-xs)] text-fg-muted" dir="ltr">
                          {row.referrer.phone}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.colReferred}</p>
                      <Link href={`/admin/students/${encodeURIComponent(row.referred.id)}`} className="block truncate font-semibold text-fg hover:underline">
                        {row.referred.name}
                      </Link>
                      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{DATE.format(new Date(row.createdAt))}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--fs-text-xs)] font-semibold"
                        style={{ color: hue, background: tint(hue, 14) }}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        {c.status[row.status]}
                        {row.blockReason ? ` · ${c.blockReason[row.blockReason] ?? row.blockReason}` : ''}
                      </span>
                      {row.referrerRewardCents !== null && row.friendRewardCents !== null ? (
                        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                          {formatCopy(c.rewardPair, {
                            referrer: formatEGP(row.referrerRewardCents),
                            friend: formatEGP(row.friendRewardCents),
                          })}
                        </span>
                      ) : null}
                      {row.reversedCents !== null ? (
                        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                          {formatCopy(c.reversedAmount, { amount: formatEGP(row.reversedCents) })}
                        </span>
                      ) : null}
                      {row.noticeOutcome ? (
                        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                          {c.notice[row.noticeOutcome] ?? row.noticeOutcome}
                        </span>
                      ) : null}
                      {row.status === 'joined' || row.status === 'credited' || row.status === 'blocked' ? (
                        <VoidReferralButton id={row.id} />
                      ) : null}
                    </div>
                    {row.voidReason ? (
                      <p className="text-[length:var(--fs-text-xs)] text-fg-muted md:col-span-3">{row.voidReason}</p>
                    ) : null}
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

        <aside className="grid gap-6">
          <section className="rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5">
            <h2 className="mb-4 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.settingsTitle}</h2>
            <ReferralProgramForm initial={program} />
          </section>

          <section className="rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5">
            <h2 className="mb-4 flex items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg">
              <Crown className="size-5" style={{ color: 'var(--viz-1)' }} aria-hidden="true" />
              {c.topTitle}
            </h2>
            {top.length === 0 ? (
              <p className="text-fg-muted">{c.topEmpty}</p>
            ) : (
              <ol className="grid gap-2">
                {top.map((entry, index) => (
                  <li key={entry.student.id} className="flex items-center gap-3 rounded-md bg-surface-1 p-2.5">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full font-bold text-white"
                      style={{ background: index === 0 ? 'var(--viz-1)' : index === 1 ? 'var(--viz-3)' : 'var(--viz-2)' }}
                    >
                      {(index + 1).toLocaleString('ar-EG-u-nu-latn')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/students/${encodeURIComponent(entry.student.id)}`} className="block truncate font-semibold text-fg hover:underline">
                        {entry.student.name}
                      </Link>
                      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                        {formatCopy(c.topCounts, {
                          joined: entry.joined.toLocaleString('ar-EG-u-nu-latn'),
                          credited: entry.credited.toLocaleString('ar-EG-u-nu-latn'),
                        })}
                      </p>
                    </div>
                    <span className="font-bold text-fg" dir="ltr">
                      {formatEGP(entry.earnedCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
