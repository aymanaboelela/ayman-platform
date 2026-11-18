import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, CalendarDays, Coins, UserPlus, type LucideIcon } from 'lucide-react';
import {
  AcquisitionReportSchema,
  type AcquisitionReport,
} from '@ayman/contracts/admin/acquisition';
import { copy } from '@ayman/contracts/copy/admin';
import { adminAcquisitionCopy as c } from '@ayman/contracts/copy/admin-acquisition';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { formatAmount, formatCount, formatShare } from '@/components/admin/money/money-format';
import { AnalyticsNav } from '../analytics-nav';

export const metadata = { title: c.title };

/** `0` is «من الأول» — no lower bound at all. */
const WINDOWS = [7, 30, 90, 0] as const;
type Window = (typeof WINDOWS)[number];

const RANGE_LABEL: Record<Window, string> = {
  7: c.range7,
  30: c.range30,
  90: c.range90,
  0: c.rangeAll,
};

/** `?days=45` is a URL somebody typed. Snap it rather than 400 the page. */
function safeWindow(raw: string | undefined): Window {
  const days = Number.parseInt(raw ?? '', 10);
  return (WINDOWS as readonly number[]).includes(days) ? (days as Window) : 30;
}

const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The first Cairo day of a window that ENDS today — the same day keys the API
 * buckets accounts by. Stepped back on a UTC-midnight date so no local time
 * zone or daylight-saving hour can move it.
 */
function windowStart(days: Exclude<Window, 0>, now: Date): string {
  const start = new Date(`${CAIRO_DAY.format(now)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString().slice(0, 10);
}

const tint = (hue: string, percent: number) =>
  `color-mix(in oklab, ${hue} ${percent}%, var(--color-surface-1))`;

/**
 * «التحليلات ← مصادر التسجيل» — what each ad link brought.
 *
 * «بدأت إعلانات على فيسبوك: كام طالب عمل حساب من الحملة دي، وكام واحد منهم
 * دفع؟» One fetch; every count and sum is the API's, and the page only lays
 * them out (plus one division, the pay rate, which is a ratio of two figures
 * already on the row).
 *
 * The window is a closed list of links, like «الفلوس يوم بيوم» — a URL he can
 * bookmark, and no client runtime for four pills.
 *
 * Two gates, matching the API's two: the entitlement (a stack without the
 * feature gets a 404 instead of an error screen) and `payment:read`
 * (`adminGetOrForbidden` — a reader without it who types the URL gets a panel
 * that says why).
 */
export default async function AnalyticsSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!(await getEntitlements()).signupSources) notFound();

  const days = safeWindow((await searchParams).days);
  const query = days === 0 ? '' : `?from=${windowStart(days, new Date())}`;
  const report = await adminGetOrForbidden(
    `/api/admin/acquisition/report${query}`,
    AcquisitionReportSchema,
  );

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      </header>

      <AnalyticsNav />

      {report === null ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-fg-muted">{copy.admin.settings.panelForbidden}</p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.admin.settings.panelForbiddenHint}
          </p>
        </div>
      ) : (
        <SourcesReport report={report} days={days} />
      )}
    </div>
  );
}

function SourcesReport({ report, days }: { report: AcquisitionReport; days: Window }) {
  const { rows, totals } = report;

  return (
    <>
      <nav aria-label={c.rangeLabel} className="mb-5 flex flex-wrap items-center gap-2">
        <span className="me-1 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          <CalendarDays className="size-4" aria-hidden="true" />
          {c.rangeLabel}
        </span>
        {WINDOWS.map((value) => (
          <Link
            key={value}
            href={value === 30 ? '/admin/analytics/sources' : `/admin/analytics/sources?days=${value}`}
            aria-current={value === days ? 'page' : undefined}
            className={cn(
              'rounded-full border px-4 py-1.5 text-[length:var(--fs-text-sm)] font-medium',
              'transition-colors duration-[160ms] ease-out',
              value === days
                ? 'border-accent bg-accent text-[color:var(--on-accent-ink)]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {RANGE_LABEL[value]}
          </Link>
        ))}
      </nav>

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Tile
          icon={UserPlus}
          hue="var(--viz-5)"
          label={c.tileSignups}
          value={formatCount(totals.signups)}
          context={formatCopy(c.tileSignupsContext, { n: formatCount(totals.campaigns) })}
        />
        <Tile
          icon={BadgeCheck}
          hue="var(--viz-6)"
          label={c.tilePaid}
          value={formatCount(totals.paid)}
          context={
            totals.paid === 0
              ? c.tilePaidNone
              : formatCopy(c.tilePaidContext, { share: formatShare(totals.paid / totals.signups) })
          }
        />
        <Tile
          icon={Coins}
          hue="var(--viz-1)"
          label={c.tileRevenue}
          value={formatAmount(totals.revenueCents)}
          context={c.tileRevenueContext}
        />
      </section>

      {rows.length === 0 ? (
        <div className="mb-8 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-fg-muted">{c.empty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.emptyHint}
          </p>
          {/* A query string inside an Arabic paragraph: without the isolate
              bidi reorders it around the `&`s (CLAUDE.md §7). */}
          <code
            dir="ltr"
            className="mono mt-3 inline-block max-w-full overflow-x-auto rounded-md bg-surface-2 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg"
            style={{ unicodeBidi: 'isolate' }}
          >
            {c.emptyExample}
          </code>
        </div>
      ) : (
        <section className="mb-8">
          <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold text-fg">{c.tableTitle}</h2>
          {/* Four columns, not seven: source and medium sit under the campaign
              and the pay rate under the count, so the three numbers he came
              for are on screen on a phone without scrolling the table. */}
          <div className="overflow-x-auto rounded-lg border border-line bg-surface-2">
            <table className="w-full text-start text-[length:var(--fs-text-sm)]">
              <thead>
                <tr className="border-b border-line text-start text-fg-muted">
                  {/* `w-full`: the names get whatever the three numbers leave.
                      On a phone that is their bare minimum; from `md` up each
                      number has a fixed share, or the three huddle against
                      the far edge with half the table empty between. */}
                  <th className="w-full p-3 text-start font-medium">{c.colCampaign}</th>
                  <th className="p-3 text-start font-medium md:min-w-36 md:whitespace-nowrap">{c.colSignups}</th>
                  <th className="p-3 text-start font-medium md:min-w-36 md:whitespace-nowrap">{c.colPaid}</th>
                  <th className="p-3 text-start font-medium md:min-w-36 md:whitespace-nowrap">{c.colRevenue}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const origin = [row.source, row.medium].filter((part) => part !== null).join(' · ');
                  return (
                    <tr
                      // The three together are the API's GROUP BY, so they are
                      // unique; `\u0000` cannot appear in any of them.
                      key={[row.source, row.medium, row.campaign].join('\u0000')}
                      className="border-b border-line-subtle align-top last:border-b-0"
                    >
                      <td className="p-3">
                        {row.campaign === null ? (
                          <span className="font-medium text-fg-muted">{c.noCampaign}</span>
                        ) : (
                          <Latin className="font-medium text-fg">{row.campaign}</Latin>
                        )}
                        {/* `text-end`: the line is its own LTR block, whose END
                            is the cell's start — under the name, not across
                            the cell from it. */}
                        {origin === '' ? null : (
                          <Latin className="mono mt-0.5 block text-end text-[length:var(--fs-text-xs)] text-fg-muted">
                            {origin}
                          </Latin>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-fg">{formatCount(row.signups)}</td>
                      <td className="p-3">
                        <span className="font-semibold text-fg">{formatCount(row.paid)}</span>
                        <span className="mt-0.5 block text-[length:var(--fs-text-xs)] text-fg-muted">
                          {formatShare(row.paid / row.signups)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-3 font-semibold text-fg">
                        {formatAmount(row.revenueCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totals.campaigns > rows.length ? (
            <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">
              {formatCopy(c.truncated, {
                shown: formatCount(rows.length),
                total: formatCount(totals.campaigns),
              })}
            </p>
          ) : null}
        </section>
      )}

      <section className="rounded-lg border border-line-subtle bg-surface-2 p-4 md:p-5">
        <h2 className="mb-2 text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.notesTitle}</h2>
        <ul className="grid list-disc gap-1.5 ps-5 text-[length:var(--fs-text-sm)] text-fg-muted">
          <li>{c.noteWindow}</li>
          <li>{c.notePaid}</li>
          <li>{c.noteFirstTouch}</li>
          <li>{c.noteFacebook}</li>
        </ul>
      </section>
    </>
  );
}

/**
 * A value off somebody's URL, isolated left-to-right.
 *
 * These are Latin tokens (`facebook`, `y2-lesson10`) inside an RTL table, and
 * a hyphenated one flips around its hyphens without the isolate (CLAUDE.md
 * §7). Not `<bdi>`, which picks the direction per value: a campaign that
 * starts with a digit would then read backwards. `wrap-anywhere` because
 * nothing stops a campaign name being 120 characters with no space in it —
 * and not `break-all`, which cut «story» in half on a phone when the space
 * before it was right there.
 */
function Latin({ className, children }: { className?: string; children: string }) {
  return (
    <span dir="ltr" className={cn('wrap-anywhere', className)} style={{ unicodeBidi: 'isolate' }}>
      {children}
    </span>
  );
}

function Tile({
  icon: Icon,
  hue,
  label,
  value,
  context,
}: {
  icon: LucideIcon;
  hue: string;
  label: string;
  value: string;
  context: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: tint(hue, 40), background: tint(hue, 10) }}
    >
      <Icon className="mb-2 size-5" style={{ color: hue }} aria-hidden="true" />
      <p className="text-[length:var(--fs-title-3)] font-bold text-fg">{value}</p>
      <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{label}</p>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{context}</p>
    </div>
  );
}
