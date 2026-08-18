import type { SearchParams } from 'nuqs/server';
import { z } from 'zod';
import { AnalyticsOverviewSchema, GRADE_BANDS } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { ColumnChart } from '@/components/admin/charts/column-chart';
import { DonutChart } from '@/components/admin/charts/donut-chart';
import { BarList } from '@/components/admin/charts/bar-list';
import { AreaChart } from '@/components/admin/charts/area-chart';
import { Meter, StatTile } from '@/components/admin/charts/stat-tile';
import {
  bucketLabel,
  duration,
  durationBucketLabel,
  hours,
  maybe,
  num,
  pct,
} from '@/components/admin/charts/format';
import { ordinalColor, sequentialColor, seriesColor } from '@/components/admin/charts/palette';
import { Section } from '@/components/admin/charts/section';
import { AnalyticsNav } from './analytics-nav';
import { FilterBar } from './filter-bar';
import { overviewCache, safeWindow } from './search-params';

const c = copy.analytics;

const CourseOptionSchema = z.object({ id: z.string(), title: z.string() });

export const metadata = { title: c.title };

/**
 * «نظرة عامة» — the whole cohort on one screen.
 *
 * Uncached, like every admin read (`adminGet` is `cache: 'no-store'`): an
 * instructor checking the numbers right after a batch of students submit has
 * to see the submissions, and a cached analytics page is indistinguishable
 * from a broken one.
 *
 * Reading order is deliberate and is the argument the page makes:
 *   1. who is here            (headcount, activity)
 *   2. did they watch         (rate, hours, how far they got)
 *   3. did they sit the exam  (participation, scores, bands, time)
 *   4. when, and who exactly  (the trend, then the cohort splits)
 * Anyone who stops reading after row 1 still has the honest headline.
 */
export default async function AnalyticsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = overviewCache.parse(await searchParams);
  const days = safeWindow(query.days);

  const params = new URLSearchParams({ days: String(days) });
  if (query.courseId) params.set('courseId', query.courseId);

  /** Carried onto every outbound link so the screen on the far side counts the
   *  same population this one does. A link that drops the filter lands the
   *  reader on a bigger number than the one they pressed. */
  const courseQuery = query.courseId ? `?courseId=${query.courseId}` : '';

  const [overview, courses] = await Promise.all([
    adminGet(`/api/admin/analytics/overview?${params.toString()}`, AnalyticsOverviewSchema),
    adminGet('/api/admin/courses', z.array(CourseOptionSchema)),
  ]);

  const { students, video, quiz } = overview;

  const engagementSlices = overview.engagement.map((slice, index) => ({
    key: slice.segment,
    label: c.segment[slice.segment],
    value: slice.n,
    color: seriesColor(index),
  }));

  const bandRows = overview.gradeBands.map((row, index) => ({
    key: row.band,
    label: c.bandShort[row.band],
    value: row.n,
    // Ordinal, reversed: the ramp's darkest step is the top band, so the
    // colour carries the order the way the labels do. Deliberately NOT
    // green-to-red — a light green and a light red are the same colour under
    // deuteranopia, and pass/fail already has its own honest home in
    // `passRate` below.
    color: ordinalColor(GRADE_BANDS.length - 1 - index, GRADE_BANDS.length),
  }));
  const bandTotal = bandRows.reduce((sum, row) => sum + row.value, 0);

  const scoreColumns = Array.from({ length: 10 }, (_, index) => {
    const bucket = index + 1;
    const n = overview.scoreBuckets.find((row) => row.bucket === bucket)?.n ?? 0;
    return {
      key: String(bucket),
      label: num(bucket * 10),
      value: n,
      color: sequentialColor(bucket / 10),
      tooltip: bucketLabel(bucket),
    };
  });

  const completionColumns = Array.from({ length: 10 }, (_, index) => {
    const bucket = index + 1;
    const n = overview.completionBuckets.find((row) => row.bucket === bucket)?.n ?? 0;
    return {
      key: String(bucket),
      label: num(bucket * 10),
      value: n,
      color: sequentialColor(bucket / 10),
      tooltip: bucketLabel(bucket),
    };
  });

  const durationColumns = overview.durationBuckets.map((row, index) => {
    const previous = index === 0 ? null : (overview.durationBuckets[index - 1]?.upperSeconds ?? null);
    const label = durationBucketLabel(row.upperSeconds, previous);
    return {
      key: String(row.upperSeconds ?? 'over'),
      label: row.upperSeconds === null ? `+` : duration(row.upperSeconds),
      value: row.n,
      color: sequentialColor((index + 1) / (overview.durationBuckets.length + 1)),
      tooltip: label,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      </header>

      <AnalyticsNav />
      <FilterBar courses={courses} />

      {/*
        Four named bands, in the order the argument runs: who is here, did they
        watch, did they sit the exam, and then the splits. Every heading links
        to the screen that lists its own rows, and `courseQuery` carries the
        course filter across so the far side shows the same population — a link
        that silently widens the filter makes the two counts disagree, which is
        the fastest way to lose the reader's trust in both.
      */}
      <Section
        title={c.sectionWhoTitle}
        lead={c.sectionWhoLead}
        href={`/admin/analytics/students${courseQuery}`}
        linkLabel={c.goToStudents}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile
            label={c.studentsTotal}
            value={num(students.total)}
            accent
            href={`/admin/analytics/students${courseQuery}`}
          />
          {/* The denominator of every meter below, stated as a number of
              people before any of them divide by it. Its slot used to hold
              «كمّلوا التسجيل», which read ١٠٠٪ on every render there has ever
              been — a student cannot enroll before finishing onboarding, and
              the tile's own denominator required an enrollment. */}
          <StatTile
            label={c.enrolled}
            value={num(students.enrolled)}
            context={pct(students.total > 0 ? students.enrolled / students.total : null)}
          />
          <StatTile
            label={c.activeLast7}
            value={num(students.activeLast7)}
            href={`/admin/analytics/students${courseQuery}${courseQuery ? '&' : '?'}sort=lastActiveAt&dir=desc`}
          />
          <StatTile
            label={c.activeLast30}
            value={num(students.activeLast30)}
            href={`/admin/analytics/students${courseQuery}${courseQuery ? '&' : '?'}sort=lastActiveAt&dir=desc`}
          />
          <StatTile label={c.newLast30} value={num(students.newLast30)} href="/admin/students" />
        </div>
      </Section>

      <Section
        title={c.sectionWatchTitle}
        lead={c.sectionWatchLead}
        href={`/admin/analytics/lessons${courseQuery}`}
        linkLabel={c.goToLessons}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface-2 p-4 sm:p-5">
            <Meter
              label={c.watchRate}
              fraction={video.watchRate}
              numerator={video.watchers}
              denominator={video.eligible}
            />
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label={c.watchHours} value={hours(video.watchHours)} />
              <Figure label={c.lessonsOpened} value={num(video.lessonsOpened)} />
              <Figure label={c.lessonsCompleted} value={num(video.lessonsCompleted)} />
              <Figure label={c.avgCompletion} value={pct(video.avgCompletion)} />
            </dl>
          </div>

          <ChartCard
            title={c.completionDistribution}
            isEmpty={video.lessonsOpened === 0}
            rows={completionColumns.map((column) => ({
              label: bucketLabel(Number(column.key)),
              value: num(column.value),
              share: video.lessonsOpened > 0 ? column.value / video.lessonsOpened : null,
            }))}
          >
            <ColumnChart columns={completionColumns} />
          </ChartCard>
        </div>
      </Section>

      <Section
        title={c.sectionQuizTitle}
        lead={c.sectionQuizLead}
        href="/admin/attempts"
        linkLabel={c.goToAttempts}
      >
        <div className="mb-4 rounded-lg border border-line bg-surface-2 p-4 sm:p-5">
          <Meter
            label={c.participationRate}
            fraction={quiz.participationRate}
            numerator={quiz.participants}
            denominator={video.eligible}
            color="var(--viz-2)"
          />
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label={c.meanScore} value={pct(quiz.meanScore, 1)} />
            <Figure label={c.medianScore} value={pct(quiz.medianScore, 1)} />
            <Figure label={c.passRate} value={pct(quiz.passRate)} />
            <Figure label={c.medianDuration} value={duration(quiz.medianDurationSeconds)} />
          </dl>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title={c.scoreDistribution}
            hint={c.scoreDistributionHint}
            isEmpty={quiz.attempts === 0}
            rows={scoreColumns.map((column) => ({
              label: bucketLabel(Number(column.key)),
              value: num(column.value),
              share: quiz.attempts > 0 ? column.value / quiz.attempts : null,
            }))}
          >
            <ColumnChart columns={scoreColumns} />
          </ChartCard>

          <ChartCard
            title={c.gradeBands}
            hint={c.gradeBandsHint}
            isEmpty={bandTotal === 0}
            rows={bandRows.map((row) => ({
              label: c.band[row.key as keyof typeof c.band],
              value: num(row.value),
              share: bandTotal > 0 ? row.value / bandTotal : null,
              color: row.color,
            }))}
          >
            <BarList
              ariaLabel={c.gradeBands}
              rows={bandRows.map((row) => ({
                key: row.key,
                label: c.band[row.key as keyof typeof c.band],
                value: row.value,
                display: num(row.value),
                displayNote: bandTotal > 0 ? pct(row.value / bandTotal) : c.unknown,
                color: row.color,
              }))}
            />
          </ChartCard>

          <ChartCard
            title={c.durationDistribution}
            hint={c.durationDistributionHint}
            isEmpty={quiz.attempts === 0}
            className="lg:col-span-2"
            rows={durationColumns.map((column) => ({
              label: column.tooltip,
              value: num(column.value),
              share: quiz.attempts > 0 ? column.value / quiz.attempts : null,
            }))}
          >
            <ColumnChart columns={durationColumns} />
          </ChartCard>
        </div>
      </Section>

      <Section
        title={c.sectionBreakdownTitle}
        lead={c.sectionBreakdownLead}
        href="/admin/students"
        linkLabel={c.goToStudentRecords}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title={c.engagement}
            hint={c.engagementHint}
            isEmpty={video.eligible === 0}
            rows={engagementSlices.map((slice) => ({
              label: slice.label,
              value: num(slice.value),
              share: video.eligible > 0 ? slice.value / video.eligible : null,
              color: slice.color,
            }))}
          >
            <DonutChart slices={engagementSlices} total={video.eligible} totalLabel={c.eligible} />
          </ChartCard>

          {/* Both breakdowns link INTO the student records with the matching
              filter already applied, so pressing «الصف ٢» lands on that cohort
              rather than on the unfiltered list with a number to re-find. */}
          <ChartCard
            title={c.byYear}
            isEmpty={overview.byYear.length === 0}
            rows={overview.byYear.map((row) => ({
              label: formatCopy(c.yearLabel, { n: num(row.year) }),
              value: num(row.students),
            }))}
          >
            <BarList
              ariaLabel={c.byYear}
              rows={overview.byYear.map((row, index) => ({
                key: String(row.year),
                label: formatCopy(c.yearLabel, { n: num(row.year) }),
                value: row.students,
                display: num(row.students),
                color: ordinalColor(index, Math.max(1, overview.byYear.length)),
                meta: `${c.meanScore}: ${pct(row.meanScore, 1)} · ${c.avgCompletion}: ${pct(row.avgCompletion)}`,
                href: `/admin/analytics/students?year=${row.year}`,
              }))}
            />
          </ChartCard>

          <ChartCard
            title={c.byGovernorate}
            isEmpty={overview.byGovernorate.length === 0}
            rows={overview.byGovernorate.map((row) => ({
              label: row.nameAr,
              value: num(row.students),
            }))}
          >
            <BarList
              ariaLabel={c.byGovernorate}
              rows={overview.byGovernorate.map((row) => ({
                key: row.code,
                label: row.nameAr,
                value: row.students,
                display: num(row.students),
                // Nominal categories: ONE hue for all of them. Colouring each
                // governorate differently would spend the identity channel
                // re-encoding what the bar length already says.
                color: 'var(--viz-1)',
                meta: `${c.meanScore}: ${pct(row.meanScore, 1)}`,
                href: `/admin/students?governorate=${row.code}`,
              }))}
            />
          </ChartCard>

          <ChartCard
            title={c.activityTitle}
            isEmpty={overview.daily.every((point) => point.watchMinutes === 0 && point.attempts === 0)}
            rows={overview.daily
              .filter((point) => point.watchMinutes > 0 || point.attempts > 0)
              .map((point) => ({
                label: point.date,
                value: `${num(point.watchMinutes)} ${c.minutesShort} · ${num(point.attempts)}`,
              }))}
          >
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {c.watchMinutes}
                </p>
                <AreaChart
                  points={overview.daily.map((point) => ({
                    date: point.date,
                    value: Math.round(point.watchMinutes),
                  }))}
                  valueLabel={c.watchMinutes}
                  unit={c.minutesShort}
                />
              </div>
              {/* A SECOND chart, never a second y-axis on the first. Minutes and
                  attempt counts have no common scale, and overlaying them makes
                  their crossing point look like it means something. */}
              <div>
                <p className="mb-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {c.attemptsPerDay}
                </p>
                <AreaChart
                  points={overview.daily.map((point) => ({
                    date: point.date,
                    value: point.attempts,
                  }))}
                  color="var(--viz-2)"
                  valueLabel={c.attemptsPerDay}
                />
              </div>
            </div>
          </ChartCard>
        </div>
      </Section>

      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
        {maybe(quiz.attempts)} · {c.attempts} — {c.exportHint}
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[length:var(--fs-title-4)] font-semibold text-fg">
        {value}
      </dd>
    </div>
  );
}
