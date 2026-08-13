import Link from 'next/link';
import { GRADE_BANDS, StudentAnalyticsDetailSchema } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { ColumnChart } from '@/components/admin/charts/column-chart';
import { BarList } from '@/components/admin/charts/bar-list';
import { AreaChart } from '@/components/admin/charts/area-chart';
import { StatTile } from '@/components/admin/charts/stat-tile';
import {
  bucketLabel,
  dateTime,
  duration,
  hours,
  num,
  pct,
} from '@/components/admin/charts/format';
import { ordinalColor, sequentialColor } from '@/components/admin/charts/palette';
import { AnalyticsNav } from '../../analytics-nav';

const c = copy.analytics;

export const metadata = { title: c.studentProfile };

type AttemptState = keyof typeof c.attemptStates;

/**
 * One student, every number the platform holds about them — each one shown
 * against the cohort's own average.
 *
 * The comparison is the whole design. «متوسط درجاته ٦٨٪» is unanswerable on
 * its own: it is either excellent or alarming depending on a number that was
 * on a different screen. Every headline here carries the cohort figure beside
 * it, so a reader never has to remember one.
 */
export default async function StudentAnalyticsDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const detail = await adminGet(
    `/api/admin/analytics/students/${userId}`,
    StudentAnalyticsDetailSchema,
  );
  const { summary, cohort } = detail;

  const bandTotal = detail.gradeBands.reduce((sum, row) => sum + row.n, 0);
  const bandRows = detail.gradeBands.map((row, index) => ({
    key: row.band,
    label: c.band[row.band],
    value: row.n,
    display: `${num(row.n)} · ${bandTotal > 0 ? pct(row.n / bandTotal) : c.unknown}`,
    color: ordinalColor(GRADE_BANDS.length - 1 - index, GRADE_BANDS.length),
  }));

  const scoreColumns = Array.from({ length: 10 }, (_, index) => {
    const bucket = index + 1;
    return {
      key: String(bucket),
      label: num(bucket * 10),
      value: detail.scoreBuckets.find((row) => row.bucket === bucket)?.n ?? 0,
      color: sequentialColor(bucket / 10),
      tooltip: bucketLabel(bucket),
    };
  });

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Link
        href="/admin/analytics/students"
        className="mb-4 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        {'< '}
        {c.navStudents}
      </Link>

      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
          {summary.fullName}
        </h1>
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {summary.year === null ? '' : formatCopy(c.yearLabel, { n: num(summary.year) })}
          {summary.governorateNameAr ? ` · ${summary.governorateNameAr}` : ''}
        </p>
        <Link
          href={`/admin/students/${userId}`}
          className="text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
        >
          {copy.admin.students.detailTitle}
        </Link>
      </header>

      <AnalyticsNav />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={c.columnLessonsCompleted}
          value={num(summary.lessonsCompleted)}
          context={`${c.lessonsOpened}: ${num(summary.lessonsOpened)}`}
          accent
        />
        <StatTile
          label={c.avgCompletion}
          value={pct(summary.avgCompletion)}
          context={compare(summary.avgCompletion, cohort.avgCompletion)}
        />
        <StatTile
          label={c.meanScore}
          value={pct(summary.meanScore, 1)}
          context={compare(summary.meanScore, cohort.meanScore)}
        />
        <StatTile
          label={c.passRate}
          value={pct(summary.passRate)}
          context={compare(summary.passRate, cohort.passRate)}
        />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={c.watchHours} value={hours(summary.watchHours)} />
        <StatTile label={c.attempts} value={num(summary.attempts)} />
        <StatTile label={c.bestScore} value={pct(summary.bestScore, 1)} />
        <StatTile
          label={c.medianDuration}
          value={duration(summary.medianQuizSeconds)}
          context={`${c.cohortAverage}: ${duration(cohort.medianQuizSeconds)}`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={c.scoreDistribution}
          rows={scoreColumns.map((column) => ({
            label: bucketLabel(Number(column.key)),
            value: num(column.value),
          }))}
        >
          <ColumnChart columns={scoreColumns} />
        </ChartCard>

        <ChartCard
          title={c.gradeBands}
          hint={c.gradeBandsHint}
          rows={bandRows.map((row) => ({
            label: row.label,
            value: num(row.value),
            share: bandTotal > 0 ? row.value / bandTotal : null,
            color: row.color,
          }))}
        >
          <BarList ariaLabel={c.gradeBands} rows={bandRows} />
        </ChartCard>

        <ChartCard
          title={c.coursesTitle}
          className="lg:col-span-2"
          rows={detail.courses.map((course) => ({
            label: course.title,
            value: `${num(course.completed)}/${num(course.lessons)}`,
            share: course.avgCompletion,
          }))}
        >
          <BarList
            ariaLabel={c.coursesTitle}
            rows={detail.courses.map((course) => ({
              key: course.courseId,
              label: course.title,
              value: course.lessons > 0 ? course.completed / course.lessons : 0,
              display: `${num(course.completed)}/${num(course.lessons)}`,
              color: 'var(--viz-1)',
              meta: `${c.avgCompletion}: ${pct(course.avgCompletion)} · ${hours(course.watchHours)}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          title={c.activityTitle}
          className="lg:col-span-2"
          rows={detail.daily
            .filter((point) => point.watchMinutes > 0 || point.attempts > 0)
            .map((point) => ({
              label: point.date,
              value: `${num(point.watchMinutes)} ${c.minutesShort} · ${num(point.attempts)}`,
            }))}
        >
          <AreaChart
            points={detail.daily.map((point) => ({
              date: point.date,
              value: Math.round(point.watchMinutes),
            }))}
            valueLabel={c.watchMinutes}
            valueFormatter={(value) => `${num(value)} ${c.minutesShort}`}
          />
        </ChartCard>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold text-fg">
          {c.attemptsTitle}
        </h2>
        {detail.attempts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">
            {c.noData}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[44rem] text-[length:var(--fs-text-sm)]">
              <thead className="bg-surface-3">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium text-fg-muted">
                    {c.columnQuiz}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnAttemptNo}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnState}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnScore}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnQuizTime}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnSubmittedAt}
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.attempts.map((attempt) => (
                  <tr
                    key={attempt.attemptId}
                    className="border-t border-line-subtle hover:bg-surface-2"
                  >
                    <th scope="row" className="max-w-72 px-3 py-2 text-start font-normal">
                      <span className="block truncate text-fg">{attempt.quizTitle}</span>
                    </th>
                    <td className="tabular px-3 py-2 text-end">{num(attempt.attemptNo)}</td>
                    <td className="px-3 py-2 text-end">
                      <span
                        className={cn(
                          'text-[length:var(--fs-text-xs)]',
                          // Status colour, with the label right beside it —
                          // never colour alone. `passed === false` is a real
                          // fail; a null is "not decided yet", which is not
                          // the same thing and must not wear the fail colour.
                          attempt.passed === true && 'text-[color:var(--ok)]',
                          attempt.passed === false && 'text-[color:var(--err)]',
                          attempt.passed === null && 'text-fg-muted',
                        )}
                      >
                        {c.attemptStates[attempt.state as AttemptState] ?? attempt.state}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 text-end">{pct(attempt.score, 1)}</td>
                    <td className="tabular px-3 py-2 text-end whitespace-nowrap">
                      {duration(attempt.seconds)}
                    </td>
                    <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg-muted">
                      {dateTime(attempt.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * «فوق المتوسط بـ ٪١٢». Returns the cohort figure alone when the student has
 * no value of their own — the comparison would be meaningless, but the
 * benchmark is still worth showing.
 */
function compare(value: number | null, cohortValue: number | null): string {
  if (cohortValue === null) return '';
  if (value === null) return `${c.cohortAverage}: ${pct(cohortValue)}`;
  const delta = value - cohortValue;
  if (Math.abs(delta) < 0.005) return c.sameAsCohort;
  const template = delta > 0 ? c.above : c.below;
  return formatCopy(template, { n: pct(Math.abs(delta)) });
}
