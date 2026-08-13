import Link from 'next/link';
import { Download } from 'lucide-react';
import { GRADE_BANDS, LessonAnalyticsDetailSchema } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { ColumnChart } from '@/components/admin/charts/column-chart';
import { DonutChart } from '@/components/admin/charts/donut-chart';
import { BarList } from '@/components/admin/charts/bar-list';
import { Meter, StatTile } from '@/components/admin/charts/stat-tile';
import {
  bucketLabel,
  dateTime,
  duration,
  durationBucketLabel,
  hours,
  num,
  pct,
} from '@/components/admin/charts/format';
import { ordinalColor, sequentialColor, seriesColor } from '@/components/admin/charts/palette';
import { AnalyticsNav } from '../../analytics-nav';

const c = copy.analytics;

export const metadata = { title: c.navLessons };

/** One lesson, every student in it — including the ones who never opened it.
 *  Those rows are the reason this screen exists. */
export default async function LessonAnalyticsDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const detail = await adminGet(
    `/api/admin/analytics/lessons/${lessonId}`,
    LessonAnalyticsDetailSchema,
  );
  const { summary } = detail;

  const engagementSlices = detail.engagement.map((slice, index) => ({
    key: slice.segment,
    label: c.segment[slice.segment],
    value: slice.n,
    color: seriesColor(index),
  }));

  const bandTotal = detail.gradeBands.reduce((sum, row) => sum + row.n, 0);
  const bandRows = detail.gradeBands.map((row, index) => ({
    key: row.band,
    label: c.band[row.band],
    value: row.n,
    display: num(row.n),
    displayNote: bandTotal > 0 ? pct(row.n / bandTotal) : c.unknown,
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

  const completionColumns = Array.from({ length: 10 }, (_, index) => {
    const bucket = index + 1;
    return {
      key: String(bucket),
      label: num(bucket * 10),
      value: detail.completionBuckets.find((row) => row.bucket === bucket)?.n ?? 0,
      color: sequentialColor(bucket / 10),
      tooltip: bucketLabel(bucket),
    };
  });

  const durationColumns = detail.durationBuckets.map((row, index) => ({
    key: String(row.upperSeconds ?? 'over'),
    label: row.upperSeconds === null ? '+' : duration(row.upperSeconds),
    value: row.n,
    color: sequentialColor((index + 1) / (detail.durationBuckets.length + 1)),
    tooltip: durationBucketLabel(
      row.upperSeconds,
      index === 0 ? null : (detail.durationBuckets[index - 1]?.upperSeconds ?? null),
    ),
  }));

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Link
        href="/admin/analytics/lessons"
        className="mb-4 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        {'< '}
        {c.navLessons}
      </Link>

      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{summary.title}</h1>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {summary.courseTitle} · {summary.sectionTitle}
        </p>
        {/*
          The three places this lesson also lives. Analytics answers "how did
          it go"; the next question is always one of "let me see it", "let me
          see the paper", or "let me see the sittings" — and without these the
          reader has to go and find the same lesson again by name in a
          different tree.
        */}
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-sm)]">
          <Link
            href={`/admin/courses/${summary.courseId}`}
            className="text-accent-text hover:underline"
          >
            {c.goToCourse}
          </Link>
          {summary.quizId ? (
            <>
              <Link
                href={`/admin/quizzes/${summary.quizId}/analytics`}
                className="text-accent-text hover:underline"
              >
                {c.goToQuizAnalysis}
              </Link>
              <Link
                href={`/admin/attempts?quizId=${summary.quizId}`}
                className="text-accent-text hover:underline"
              >
                {c.goToQuizAttempts}
              </Link>
            </>
          ) : null}
        </nav>
      </header>

      <AnalyticsNav />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={c.watchers}
          value={num(summary.opened)}
          context={`${c.eligible}: ${num(summary.eligible)}`}
          accent
        />
        <StatTile label={c.watchHours} value={hours(summary.watchHours)} />
        <StatTile label={c.participants} value={num(summary.quizParticipants)} />
        <StatTile label={c.meanScore} value={pct(summary.quizMeanScore, 1)} />
      </section>

      <section className="mb-4 grid gap-4 rounded-lg border border-line bg-surface-2 p-4 sm:p-5 lg:grid-cols-3">
        <Meter
          label={c.watchRate}
          fraction={summary.openRate}
          numerator={summary.opened}
          denominator={summary.eligible}
        />
        <Meter
          label={c.participationRate}
          fraction={summary.quizParticipationRate}
          numerator={summary.quizParticipants}
          denominator={summary.eligible}
          color="var(--viz-2)"
        />
        <Meter label={c.passRate} fraction={summary.quizPassRate} color="var(--viz-6)" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={c.engagement}
          hint={c.engagementHint}
          isEmpty={summary.eligible === 0}
          rows={engagementSlices.map((slice) => ({
            label: slice.label,
            value: num(slice.value),
            share: summary.eligible > 0 ? slice.value / summary.eligible : null,
            color: slice.color,
          }))}
        >
          <DonutChart slices={engagementSlices} total={summary.eligible} totalLabel={c.eligible} />
        </ChartCard>

        <ChartCard
          title={c.completionDistribution}
          isEmpty={summary.opened === 0}
          rows={completionColumns.map((column) => ({
            label: bucketLabel(Number(column.key)),
            value: num(column.value),
            share: summary.opened > 0 ? column.value / summary.opened : null,
          }))}
        >
          <ColumnChart columns={completionColumns} />
        </ChartCard>

        <ChartCard
          title={c.scoreDistribution}
          hint={c.scoreDistributionHint}
          isEmpty={summary.quizAttempts === 0}
          rows={scoreColumns.map((column) => ({
            label: bucketLabel(Number(column.key)),
            value: num(column.value),
            share: summary.quizAttempts > 0 ? column.value / summary.quizAttempts : null,
          }))}
        >
          <ColumnChart columns={scoreColumns} />
        </ChartCard>

        <ChartCard
          title={c.gradeBands}
          hint={c.gradeBandsHint}
          isEmpty={bandTotal === 0}
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
          title={c.durationDistribution}
          hint={c.durationDistributionHint}
          isEmpty={summary.quizAttempts === 0}
          className="lg:col-span-2"
          rows={durationColumns.map((column) => ({
            label: column.tooltip,
            value: num(column.value),
            share: summary.quizAttempts > 0 ? column.value / summary.quizAttempts : null,
          }))}
        >
          <ColumnChart columns={durationColumns} />
        </ChartCard>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
              {c.lessonRoster}
            </h2>
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.rosterHint}</p>
          </div>
          <a
            href={`/api/admin/analytics/lessons/${lessonId}/roster.csv`}
            download
            className={cn(
              'inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5',
              'text-[length:var(--fs-text-sm)] text-fg',
              'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3',
            )}
          >
            <Download className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            {c.exportCsv}
          </a>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[52rem] text-[length:var(--fs-text-sm)]">
            <thead className="bg-surface-3">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium text-fg-muted">
                  {c.columnStudent}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnWatched}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnProgress}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnAttempts}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnBest}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnQuizTime}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnLastSeen}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.students.map((student) => (
                <tr
                  key={student.userId}
                  className={cn(
                    'border-t border-line-subtle hover:bg-surface-2',
                    // The absentees are the point of this table, so they are
                    // dimmed rather than hidden — visibly present, visibly
                    // empty. A filter that removed them would answer the
                    // question by deleting it.
                    student.openCount === 0 && 'text-fg-muted',
                  )}
                >
                  <th scope="row" className="max-w-64 px-3 py-2 text-start font-normal">
                    <Link
                      href={`/admin/analytics/students/${student.userId}`}
                      className="block truncate font-medium text-fg hover:text-accent-text"
                    >
                      {student.fullName}
                    </Link>
                    <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                      {student.governorateNameAr ?? ''}
                    </span>
                  </th>
                  <td className="tabular px-3 py-2 text-end whitespace-nowrap">
                    {student.openCount === 0 ? c.notStarted : duration(student.watchedSeconds)}
                  </td>
                  <td className="tabular px-3 py-2 text-end">{pct(student.completion)}</td>
                  <td className="tabular px-3 py-2 text-end">{num(student.attempts)}</td>
                  <td className="tabular px-3 py-2 text-end">{pct(student.bestScore, 1)}</td>
                  <td className="tabular px-3 py-2 text-end whitespace-nowrap">
                    {duration(student.quizSeconds)}
                  </td>
                  <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg-muted">
                    {dateTime(student.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
