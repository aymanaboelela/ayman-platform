import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import {
  ArrowUpLeft,
  BookOpen,
  CalendarDays,
  Coins,
  Gift,
  RefreshCw,
  Undo2,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  AdminFinanceDailySchema,
  FINANCE_DAILY_WINDOWS,
  type AdminFinanceDaily,
  type FinanceDailyCourse,
  type FinanceDailyWindow,
} from '@ayman/contracts/admin/finance-daily';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { MUTED, seriesColor } from '@/components/admin/charts/palette';
import { StackedColumns, type StackSeries } from '@/components/admin/money/stacked-columns';
import {
  dayTitle,
  formatAmount,
  formatCount,
  formatShare,
} from '@/components/admin/money/money-format';
import { AnalyticsNav } from '../analytics-nav';
import { moneyCache } from '../search-params';

const c = copy.admin.money;
const cp = copy.admin.payments;

export const metadata = { title: c.title };

const RANGE_LABEL: Record<FinanceDailyWindow, string> = {
  7: c.range7,
  30: c.range30,
  90: c.range90,
};

/** New and renewal are one pair on every chart, tile and chip of this page,
 *  and on no course: slots 6 and 5 are an adjacent pair the palette was
 *  validated on, and the courses only ever take 1–4. */
const NEW_COLOR = 'var(--viz-6)';
const RENEWAL_COLOR = 'var(--viz-5)';
const OTHER = '__other';

/** How many courses get a hue of their own. Past four, the rest fold into one
 *  muted «كورسات تانية» — see `StackedColumns`. */
const COURSE_SLOTS = 4;

function safeWindow(days: number): FinanceDailyWindow {
  return (FINANCE_DAILY_WINDOWS as readonly number[]).includes(days)
    ? (days as FinanceDailyWindow)
    : 30;
}

/**
 * Which courses get a colour, and which colour.
 *
 * The top four by money in the window get one — but the SLOT is assigned by
 * the course's id (uuid7, so creation order), not by its rank. A course that
 * overtakes another between two windows keeps its hue: colour follows the
 * course, never its position on the leaderboard.
 */
function courseColors(courses: readonly FinanceDailyCourse[]): Map<string, string> {
  const top = courses
    .filter((course) => course.amountCents > 0)
    .slice(0, COURSE_SLOTS)
    .map((course) => course.courseId)
    .sort();
  return new Map(top.map((id, index) => [id, seriesColor(index)]));
}

/**
 * «الفلوس والاشتراكات يوم بيوم».
 *
 * «عايز تحليل يومي: كام واحد اشترك في الكورس ده والكورس ده وإجماليهم وكام
 * فلوس. عايز أعرف الدخل في اليوم — النهارده دخل كام، اليوم التاني دخل كام …
 * وكام طالب جدّد اشتراكه.»
 *
 * ## Why under «التحليلات» and not «الحسابات»
 *
 * He asked for it «في الجزء بتاع التحليلات», and it is a trend screen, not a
 * ledger: nothing here edits a row. «الحسابات» gets a tab that is a door to
 * it («يوم بيوم»), the same way it has one to the centres' money, so it is one
 * click from both places he might look.
 *
 * ## Reading order
 *
 *   1. the tiles     — today, the window, new, renewals, refunds, books
 *   2. two charts    — money per day by course; subscriptions per day, new vs renewal
 *   3. per course    — what each course sold, and which months
 *   4. per day       — every day as a row, open it for the courses
 *
 * One fetch. Every sum is the API's; the page only lays them out, so a figure
 * here and the same figure on «الحسابات» cannot come from two subtractions.
 *
 * `adminGetOrForbidden`: this is `payment:read` and the rest of «التحليلات»
 * is not. A reader without it who types the URL gets a panel that says why,
 * not a crashed page.
 */
export default async function AnalyticsMoneyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = moneyCache.parse(await searchParams);
  const days = safeWindow(query.days);

  const report = await adminGetOrForbidden(
    `/api/admin/finance/daily?days=${days}`,
    AdminFinanceDailySchema,
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
        <MoneyReport report={report} days={days} />
      )}
    </div>
  );
}

function MoneyReport({ report, days }: { report: AdminFinanceDaily; days: FinanceDailyWindow }) {
  const { totals, daily, courses } = report;
  const todayRow = daily.at(-1);
  const yesterdayRow = daily.at(-2);
  const yesterdayKey = yesterdayRow?.date;

  const colors = courseColors(courses);
  const colorOf = (courseId: string) => colors.get(courseId) ?? MUTED;
  const titleOf = new Map(courses.map((course) => [course.courseId, course.courseTitle]));
  const hasOther = courses.some((course) => course.amountCents > 0 && !colors.has(course.courseId));

  // The legend reads in the palette's order, which is the course-id order the
  // hues were dealt in — the same order the segments stack in, bottom up.
  const incomeSeries: StackSeries[] = [
    ...[...colors.entries()].map(([courseId, color]) => ({
      key: courseId,
      label: titleOf.get(courseId) ?? '',
      color,
    })),
    ...(hasOther ? [{ key: OTHER, label: c.otherCourses, color: MUTED }] : []),
  ];

  const incomeColumns = daily.map((day) => {
    const values: Record<string, number> = {};
    for (const cell of day.byCourse) {
      const key = colors.has(cell.courseId) ? cell.courseId : OTHER;
      values[key] = (values[key] ?? 0) + cell.amountCents;
    }
    return { date: day.date, title: dayTitle(day.date, report.to, yesterdayKey), values };
  });

  const subsSeries: StackSeries[] = [
    { key: 'new', label: c.seriesNew, color: NEW_COLOR },
    { key: 'renewal', label: c.seriesRenewal, color: RENEWAL_COLOR },
  ];
  const subsColumns = daily.map((day) => ({
    date: day.date,
    title: dayTitle(day.date, report.to, yesterdayKey),
    values: { new: day.newCount, renewal: day.renewalCount },
  }));

  const nothingSold = totals.subscriptionCount === 0;

  return (
    <>
      {/* The window, as a closed list of links — a URL he can bookmark, and no
          client runtime for three pills. */}
      <nav
        aria-label={c.rangeLabel}
        className="mb-5 flex flex-wrap items-center gap-2"
      >
        <span className="me-1 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          <CalendarDays className="size-4" aria-hidden="true" />
          {c.rangeLabel}
        </span>
        {FINANCE_DAILY_WINDOWS.map((value) => (
          <Link
            key={value}
            href={value === 30 ? '/admin/analytics/money' : `/admin/analytics/money?days=${value}`}
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

      <section className="mb-8 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        <MoneyTile
          icon={Wallet}
          hue="var(--a-9)"
          label={c.tileToday}
          value={formatAmount(todayRow?.netCents ?? 0)}
          context={formatCopy(c.tileTodayContext, {
            amount: formatAmount(yesterdayRow?.netCents ?? 0),
          })}
          loud
        />
        <MoneyTile
          icon={Coins}
          hue="var(--viz-1)"
          label={`${c.tileWindow} · ${RANGE_LABEL[days]}`}
          value={formatAmount(totals.netCents)}
          context={formatCopy(c.tileWindowContext, {
            amount: formatAmount(Math.round(totals.netCents / Math.max(1, daily.length))),
          })}
        />
        <MoneyTile
          icon={UserPlus}
          hue={NEW_COLOR}
          label={c.tileNew}
          value={formatCount(totals.newCount)}
          context={formatCopy(c.tileNewContext, { n: formatCount(totals.payingStudents) })}
        />
        <MoneyTile
          icon={RefreshCw}
          hue={RENEWAL_COLOR}
          label={c.tileRenewals}
          value={formatCount(totals.renewalCount)}
          context={formatCopy(c.tileRenewalsContext, { n: formatCount(totals.renewingStudents) })}
        />
        <MoneyTile
          icon={Undo2}
          hue="var(--viz-4)"
          label={c.tileRefunds}
          value={formatAmount(totals.refundCents === 0 ? 0 : -totals.refundCents)}
          context={c.tileRefundsContext}
        />
        {report.includesBooks ? (
          <MoneyTile
            icon={BookOpen}
            hue="var(--viz-3)"
            label={c.tileBooks}
            value={formatAmount(totals.bookCents)}
            context={formatCopy(c.tileBooksContext, { n: formatCount(totals.bookCount) })}
          />
        ) : (
          <MoneyTile
            icon={BookOpen}
            hue={MUTED}
            label={c.tileNoBooks}
            value="—"
            context={c.tileNoBooksContext}
          />
        )}
      </section>

      {totals.freeCount > 0 ? (
        <p className="-mt-5 mb-8 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          <Gift className="size-4 shrink-0" aria-hidden="true" />
          {formatCopy(c.freeNote, { n: formatCount(totals.freeCount) })}
        </p>
      ) : null}

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={c.chartIncomeTitle}
          hint={c.chartIncomeHint}
          isEmpty={nothingSold}
          rows={[...daily].reverse().map((day) => ({
            label: dayTitle(day.date, report.to, yesterdayKey),
            value: formatAmount(day.subscriptionCents),
          }))}
        >
          <StackedColumns
            series={incomeSeries}
            columns={incomeColumns}
            valueKind="money"
            label={c.chartIncomeTitle}
          />
        </ChartCard>

        <ChartCard
          title={c.chartSubsTitle}
          hint={c.chartSubsHint}
          isEmpty={nothingSold}
          rows={[...daily].reverse().map((day) => ({
            label: dayTitle(day.date, report.to, yesterdayKey),
            value: `${formatCount(day.subscriptionCount)} (${c.seriesNew} ${formatCount(day.newCount)} · ${c.seriesRenewal} ${formatCount(day.renewalCount)})`,
          }))}
        >
          <StackedColumns
            series={subsSeries}
            columns={subsColumns}
            valueKind="count"
            label={c.chartSubsTitle}
          />
        </ChartCard>
      </section>

      <section className="mb-8">
        <header className="mb-3">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.coursesTitle}</h2>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.coursesLead}</p>
        </header>
        {courses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">
            {c.empty}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <CourseCard
                key={course.courseId}
                course={course}
                color={colorOf(course.courseId)}
                share={
                  totals.subscriptionCents > 0 ? course.amountCents / totals.subscriptionCents : null
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <header className="mb-3">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.daysTitle}</h2>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.daysLead}</p>
        </header>

        <div className="money-days panel overflow-hidden">
          <div className="money-day__grid money-days__head" aria-hidden="true">
            <span>{c.colDay}</span>
            <span>{c.colSubscriptions}</span>
            <span>{c.colSubscriptionMoney}</span>
            <span>{report.includesBooks ? c.colBooks : ''}</span>
            <span>{c.colRefunds}</span>
            <span>{c.colNet}</span>
          </div>
          <ol>
            {[...daily].reverse().map((day) => {
              const title = dayTitle(day.date, report.to, yesterdayKey);
              const quiet =
                day.subscriptionCount === 0 &&
                day.bookCents === 0 &&
                day.refundCents === 0 &&
                day.freeCount === 0;
              const summary = (
                <>
                  <span className="money-day__date">
                    {title}
                  </span>
                  {quiet ? (
                    <span className="money-day__quiet">{c.dayNothing}</span>
                  ) : (
                    <>
                      <span className="money-day__subs">
                        <span className="font-semibold text-fg">
                          {formatCopy(c.daySubscriptions, { n: formatCount(day.subscriptionCount) })}
                        </span>
                        {day.newCount > 0 ? (
                          <span className="money-chip" style={{ '--chip-hue': NEW_COLOR } as React.CSSProperties}>
                            {c.seriesNew} {formatCount(day.newCount)}
                          </span>
                        ) : null}
                        {day.renewalCount > 0 ? (
                          <span className="money-chip" style={{ '--chip-hue': RENEWAL_COLOR } as React.CSSProperties}>
                            {c.seriesRenewal} {formatCount(day.renewalCount)}
                          </span>
                        ) : null}
                      </span>
                      <Figure label={c.colSubscriptionMoney} value={formatAmount(day.subscriptionCents)} />
                      {report.includesBooks ? (
                        <Figure label={c.colBooks} value={formatAmount(day.bookCents)} />
                      ) : (
                        <span className="money-day__blank" />
                      )}
                      <Figure
                        label={c.colRefunds}
                        value={day.refundCents > 0 ? formatAmount(-day.refundCents) : '—'}
                        tone={day.refundCents > 0 ? 'err' : undefined}
                      />
                      <Figure label={c.colNet} value={formatAmount(day.netCents)} strong />
                    </>
                  )}
                </>
              );

              if (quiet || day.byCourse.length === 0) {
                return (
                  <li key={day.date} className={cn('money-day', quiet && 'money-day--quiet')}>
                    <div className="money-day__grid">{summary}</div>
                  </li>
                );
              }

              return (
                <li key={day.date} className="money-day">
                  <details>
                    <summary className="money-day__grid">{summary}</summary>
                    <ul className="money-day__courses">
                      {day.byCourse.map((cell) => (
                        <li key={cell.courseId} className="money-day__course">
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-[3px]"
                            style={{ background: colorOf(cell.courseId) }}
                          />
                          <span className="min-w-0 flex-1 truncate text-fg">
                            {titleOf.get(cell.courseId) ?? '—'}
                          </span>
                          <span className="text-fg-muted">
                            {formatCopy(c.dayCourseCount, { n: formatCount(cell.count) })}
                          </span>
                          {cell.renewalCount > 0 ? (
                            <span className="money-chip" style={{ '--chip-hue': RENEWAL_COLOR } as React.CSSProperties}>
                              {c.seriesRenewal} {formatCount(cell.renewalCount)}
                            </span>
                          ) : null}
                          <span className="tabular font-semibold text-fg">
                            {formatAmount(cell.amountCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}

/**
 * A headline figure with its own icon well and a wash of its hue — a
 * coloured OBJECT rather than a bordered rectangle with a number in it,
 * which is what «مصمطة» has meant every time it was said about this admin.
 * The figure itself stays `text-fg`: a number tinted to match its hue reads at
 * a fraction of the contrast.
 */
function MoneyTile({
  icon: Icon,
  hue,
  label,
  value,
  context,
  loud = false,
}: {
  icon: LucideIcon;
  hue: string;
  label: string;
  value: string;
  context?: string;
  loud?: boolean;
}) {
  return (
    <div
      className={cn('money-tile panel', loud && 'money-tile--loud')}
      style={{ '--tile-hue': hue } as React.CSSProperties}
    >
      <span className="money-tile__well" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{label}</p>
        <p className="money-tile__value">{value}</p>
        {context ? (
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{context}</p>
        ) : null}
      </div>
    </div>
  );
}

function CourseCard({
  course,
  color,
  share,
}: {
  course: FinanceDailyCourse;
  color: string;
  share: number | null;
}) {
  return (
    <article className="money-course panel" style={{ '--tile-hue': color } as React.CSSProperties}>
      <header className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-1.5 size-3 shrink-0 rounded-[4px]" style={{ background: color }} />
        <h3 className="min-w-0 flex-1 text-[length:var(--fs-text-base)] font-semibold text-fg">
          {course.courseTitle}
        </h3>
        <Link
          href={`/admin/courses/${course.courseId}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
        >
          {c.openCourse}
          <ArrowUpLeft className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      <p className="money-tile__value mt-3">{formatAmount(course.amountCents)}</p>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
        {formatCopy(c.courseCounts, {
          n: formatCount(course.count),
          s: formatCount(course.studentCount),
        })}
      </p>

      {share !== null ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--viz-track)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, share * 100)}%`, background: color }}
            />
          </div>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.courseShare, { p: formatShare(share) })}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {course.newCount > 0 ? (
          <span className="money-chip" style={{ '--chip-hue': NEW_COLOR } as React.CSSProperties}>
            <UserPlus className="size-3.5" aria-hidden="true" />
            {formatCopy(c.courseNew, { n: formatCount(course.newCount) })}
          </span>
        ) : null}
        {course.renewalCount > 0 ? (
          <span className="money-chip" style={{ '--chip-hue': RENEWAL_COLOR } as React.CSSProperties}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {formatCopy(c.courseRenewal, { n: formatCount(course.renewalCount) })}
          </span>
        ) : null}
        {course.freeCount > 0 ? (
          <span className="money-chip" style={{ '--chip-hue': MUTED } as React.CSSProperties}>
            <Gift className="size-3.5" aria-hidden="true" />
            {formatCopy(c.courseFree, { n: formatCount(course.freeCount) })}
          </span>
        ) : null}
      </div>

      {course.items.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-line-subtle pt-3">
          {course.items.map((item) => (
            <li key={item.key} className="money-item">
              {formatCopy(c.itemCount, {
                label: item.label ?? planLabel(item.plan),
                n: formatCount(item.count),
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function planLabel(plan: string | null): string {
  switch (plan) {
    case 'monthly':
      return cp.planMonthly;
    case 'quarterly':
      return cp.planQuarterly;
    case 'yearly':
      return cp.planYearly;
    default:
      return '—';
  }
}

/** One figure in a day row. On a phone the column heads are gone, so each
 *  figure carries its own small label; on a wide screen the label is hidden
 *  and the head row names the column. */
function Figure({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'err';
}) {
  return (
    <span className="money-day__figure">
      <span className="money-day__label">{label}</span>
      <span
        className={cn(
          'tabular',
          strong ? 'font-semibold text-fg' : 'text-fg',
          tone === 'err' && 'text-err',
        )}
      >
        {value}
      </span>
    </span>
  );
}
