import { connection } from 'next/server';
import { HardDrive } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { R2_USD_PER_GB_MONTH, TENANT_USD_PER_GB_MONTH } from '@ayman/contracts/video';
import { cn } from '@ayman/ui';
import { formatBytes } from '@/lib/upload-format';
import { tenantVideoUsage, type TenantVideoUsage } from '@/lib/video-usage';
import { monthlyAtCurrentStorage, priceMultiplier } from '@/lib/video-usage-math';

const c = copy.admin.platforms;

function usd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

/**
 * «فيديوهات المدرّسين — المساحة والتكلفة». A server component: the Cloudflare
 * token never leaves the server, and the numbers are fetched per view — this
 * screen is opened a few times a month, to send a bill.
 */
export async function VideoUsage({ tenants }: { tenants: readonly { key: string; name: string }[] }) {
  // Request-time, never prerendered: the numbers depend on today's date and
  // on Cloudflare's answer now. Cache Components refuses a `new Date()` in a
  // server component that has not first said so (`next-prerender-current-time`).
  await connection();
  const result = await tenantVideoUsage([{ key: 'ayman', name: c.usageSelf }, ...tenants]);

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface-2 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent-text">
          <HardDrive className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.usageTitle}</h2>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {formatCopy(c.usageLead, {
              cost: R2_USD_PER_GB_MONTH.toFixed(3),
              price: TENANT_USD_PER_GB_MONTH.toFixed(2),
            })}
          </p>
        </div>
      </div>

      {!result.ok ? (
        <div className="mt-4 rounded-lg border border-dashed border-line p-4 text-[length:var(--fs-text-sm)]">
          <p className="text-fg">{result.reason === 'not-configured' ? c.usageNotConfigured : c.usageFailed}</p>
          {result.reason === 'not-configured' ? (
            <>
              <p className="mt-1 text-fg-muted">{c.usageNotConfiguredHint}</p>
              <p dir="ltr" className="mono mt-2 text-start text-fg-muted" style={{ unicodeBidi: 'isolate' }}>
                CONTROL_PLANE_CF_TOKEN=…
              </p>
            </>
          ) : result.detail ? (
            <p dir="ltr" className="mono mt-1 text-start text-[length:var(--fs-text-xs)] text-fg-subtle">
              {result.detail}
            </p>
          ) : null}
        </div>
      ) : (
        <Table rows={result.rows} />
      )}
    </section>
  );
}

/**
 * One row, in money: the teacher's at HIS price (twice the cost — see
 * `TENANT_VIDEO_PRICE_MULTIPLIER`), the owner's own at cost. The bill the owner
 * sends is the teacher's row, so that is the number the row must say.
 */
function priced(row: TenantVideoUsage) {
  const times = priceMultiplier(row.key);
  return {
    self: row.key === 'ayman',
    monthly: monthlyAtCurrentStorage(row.storedBytes, row.key),
    thisMonth: row.thisMonth.costUsd * times,
    lastMonth: row.lastMonth.costUsd * times,
  };
}

function Table({ rows }: { rows: TenantVideoUsage[] }) {
  // «هتحصّله من المدرّسين» — the owner's own row is a cost, not income.
  const teachers = rows.filter((row) => row.key !== 'ayman');
  const total = teachers.reduce(
    (sum, row) => {
      const money = priced(row);
      return {
        stored: sum.stored + row.storedBytes,
        monthly: sum.monthly + money.monthly,
        thisMonth: sum.thisMonth + money.thisMonth,
        lastMonth: sum.lastMonth + money.lastMonth,
      };
    },
    { stored: 0, monthly: 0, thisMonth: 0, lastMonth: 0 },
  );

  return (
    <>
      {/* Cards on a phone, a table from `md` — five numbers per teacher do not fit a 360px row. */}
      <ul className="mt-4 flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const money = priced(row);
          return (
            <li key={row.key} className="rounded-lg border border-line bg-surface-1 p-3">
              <p className="font-semibold text-fg">{row.name}</p>
              <p className="text-[length:var(--fs-text-xs)] text-fg-subtle">{money.self ? c.usageAtCost : c.usageCharged}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[length:var(--fs-text-xs)]">
                <Cell label={c.usageStored} value={formatBytes(row.storedBytes)} hint={`${row.objectCount} ${c.usageFiles}`} />
                <Cell label={c.usageMonthly} value={usd(money.monthly)} accent />
                <Cell label={c.usageThisMonth} value={usd(money.thisMonth)} />
                <Cell label={c.usageLastMonth} value={usd(money.lastMonth)} />
              </dl>
            </li>
          );
        })}
      </ul>

      <table className="mt-4 hidden w-full border-collapse text-[length:var(--fs-text-sm)] md:table">
        <thead>
          <tr className="border-b border-line text-start text-[length:var(--fs-text-xs)] text-fg-muted">
            <th className="py-2 text-start font-medium">{c.usageTeacher}</th>
            <th className="py-2 text-start font-medium">{c.usageStored}</th>
            <th className="py-2 text-start font-medium">{c.usageMonthly}</th>
            <th className="py-2 text-start font-medium">{c.usageThisMonth}</th>
            <th className="py-2 text-start font-medium">{c.usageLastMonth}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const money = priced(row);
            return (
              <tr key={row.key} className="border-b border-line/60">
                <td className="py-2.5">
                  <span className="font-medium text-fg">{row.name}</span>
                  <span className="block text-[length:var(--fs-text-xs)] text-fg-subtle">
                    {money.self ? c.usageAtCost : c.usageCharged}
                  </span>
                </td>
                <td className="py-2.5">
                  <span dir="ltr" className="mono tabular text-fg">
                    {formatBytes(row.storedBytes)}
                  </span>
                  <span className="ms-2 text-[length:var(--fs-text-xs)] text-fg-subtle">
                    {row.objectCount} {c.usageFiles}
                  </span>
                </td>
                <td className="py-2.5">
                  <span dir="ltr" className="mono tabular font-semibold text-accent-text">
                    {usd(money.monthly)}
                  </span>
                </td>
                <td className="py-2.5">
                  <span dir="ltr" className="mono tabular text-fg">
                    {usd(money.thisMonth)}
                  </span>
                </td>
                <td className="py-2.5">
                  <span dir="ltr" className="mono tabular text-fg">
                    {usd(money.lastMonth)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-fg">
            <td className="py-2.5">{c.usageTotal}</td>
            <td className="py-2.5">
              <span dir="ltr" className="mono tabular">
                {formatBytes(total.stored)}
              </span>
            </td>
            <td className="py-2.5">
              <span dir="ltr" className="mono tabular text-accent-text">
                {usd(total.monthly)}
              </span>
            </td>
            <td className="py-2.5">
              <span dir="ltr" className="mono tabular">
                {usd(total.thisMonth)}
              </span>
            </td>
            <td className="py-2.5">
              <span dir="ltr" className="mono tabular">
                {usd(total.lastMonth)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-3 text-[length:var(--fs-text-xs)] text-fg-subtle">{c.usageFreeTier}</p>
    </>
  );
}

function Cell({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd dir="ltr" className={cn('mono tabular text-start text-[length:var(--fs-text-sm)]', accent ? 'font-semibold text-accent-text' : 'text-fg')}>
        {value}
      </dd>
      {hint ? <dd className="text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}
