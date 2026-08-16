import Link from 'next/link';
import {
  GRADE_BANDS,
  type StudentAnalyticsDetail,
  type StudentDeviceRow,
} from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { cn } from '@ayman/ui/lib/cn';
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

const c = copy.analytics;

type AttemptState = keyof typeof c.attemptStates;
type ProgressState = keyof typeof c.progressStates;
type DeviceType = keyof typeof c.deviceTypes;
type CompletedVia = keyof typeof c.completedVia;

/**
 * Everything the platform holds about ONE student, as a page region.
 *
 * It lives here rather than inside a route because two screens need the same
 * answer and must not drift into two versions of it: `/admin/students/[id]`,
 * where an operator opens a student to deal with them, and
 * `/admin/analytics/students/[id]`, which is reached from the cohort table.
 * The first is the one that was missing it — an operator looking at a student
 * could see their phone number and their role and nothing at all about what
 * they had actually done.
 *
 * Every headline carries the cohort figure beside it. «متوسط درجاته ٦٨٪» is
 * unanswerable alone: it is excellent or alarming depending on a number that
 * used to be on a different screen.
 */
export function StudentRecord({ detail }: { detail: StudentAnalyticsDetail }) {
  const { summary, cohort, devices } = detail;

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

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={c.watchHours} value={hours(summary.watchHours)} />
        <StatTile label={c.attempts} value={num(summary.attempts)} />
        <StatTile label={c.bestScore} value={pct(summary.bestScore, 1)} />
        <StatTile
          label={c.medianDuration}
          value={duration(summary.medianQuizSeconds)}
          context={`${c.cohortAverage}: ${duration(cohort.medianQuizSeconds)}`}
        />
      </section>

      <DevicesCard devices={devices} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={c.scoreDistribution}
          isEmpty={summary.attempts === 0}
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
          title={c.coursesTitle}
          isEmpty={detail.courses.length === 0}
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
              href: `/admin/analytics/lessons?courseId=${course.courseId}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          title={c.activityTitle}
          // Watch minutes only — this card plots one series, so a student who
          // sat an exam but never opened a video would otherwise get a chart
          // that is empty for a reason the chart does not show.
          isEmpty={detail.daily.every((point) => point.watchMinutes === 0)}
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
            unit={c.minutesShort}
          />
        </ChartCard>
      </div>

      <LessonsTable lessons={detail.lessons} />
      <AttemptsTable attempts={detail.attempts} />
    </div>
  );
}

/**
 * Which devices the ACCOUNT signs in from.
 *
 * The hint under the heading is load-bearing, not decoration. Nothing joins a
 * login to a lesson or an attempt — no watch table carries a device — so this
 * card can say «بيدخل من موبايل» and can never say «اتفرّج من الموبايل». Left
 * unqualified beside a watch-hours tile, a reader would reasonably merge the
 * two into a claim we cannot support.
 */
function DevicesCard({ devices }: { devices: StudentAnalyticsDetail['devices'] }) {
  // The bars encode LOGINS — how often they actually come in on that kind of
  // hardware — with the machine count as the note beside it. Ranking by device
  // count instead would put a laptop opened once level with the phone they use
  // every morning.
  const typeRows = devices.byType.map((row, index) => ({
    key: row.type,
    label: c.deviceTypes[row.type as DeviceType] ?? row.type,
    value: row.logins,
    display: num(row.logins),
    displayNote: formatCopy(c.devicesOfType, { n: num(row.devices) }),
    color: ordinalColor(index, Math.max(devices.byType.length, 1)),
  }));

  return (
    <section className="rounded-lg border border-line bg-surface-2 p-4 sm:p-5">
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
            {c.devicesTitle}
          </h3>
          {devices.lastLoginAt ? (
            // Two elements, not one interpolated string: a label and a date in
            // one RTL paragraph is exactly the shape bidi is entitled to
            // reorder. Same rule as `BarRow.displayNote`.
            <p className="flex items-baseline gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
              <span>{c.lastLoginAt}</span>
              <span className="tabular text-fg">{dateTime(devices.lastLoginAt)}</span>
            </p>
          ) : null}
        </div>
        <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">
          {c.devicesHint}
        </p>
      </header>

      {devices.recent.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {/* A banned account's device rows are DELETED by the ban, so an empty
              list there means "we erased them", not "he never signed in". The
              two facts must not share a sentence. */}
          {devices.clearedByBan ? c.devicesClearedByBan : c.devicesEmpty}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <div>
            {/* Two facts, two lines. «٩٠ مرة دخول» and «جهازين» are different
                numbers and one sentence holding both would read as either. */}
            <p className="mb-1 text-[length:var(--fs-text-sm)] text-fg">
              {formatCopy(c.devicesCount, { n: num(devices.distinctDevices) })}
            </p>
            <p className="mb-3 text-[length:var(--fs-text-xs)] text-fg-muted">
              {formatCopy(c.loginsCount, { n: num(devices.logins) })}
            </p>
            <BarList ariaLabel={c.devicesTitle} rows={typeRows} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <p className="border-b border-line bg-surface-3 px-3 py-2 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.recentLogins}
            </p>
            <table className="w-full min-w-[28rem] text-[length:var(--fs-text-sm)]">
              <thead className="bg-surface-3">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium text-fg-muted">
                    {c.columnDevice}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnLoggedInAt}
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                    {c.columnLastActive}
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.recent.map((device) => (
                  <DeviceRow key={device.id} device={device} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function DeviceRow({ device }: { device: StudentDeviceRow }) {
  const typeLabel = c.deviceTypes[device.deviceType as DeviceType] ?? device.deviceType;

  return (
    <tr className="border-t border-line-subtle">
      <th scope="row" className="px-3 py-2 text-start font-normal">
        <span className="block truncate text-fg">{device.deviceName}</span>
        <span className="flex items-baseline gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span>{typeLabel}</span>
          {device.revoked ? <span>{c.deviceRevoked}</span> : null}
        </span>
      </th>
      <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg-muted">
        {dateTime(device.loggedInAt)}
      </td>
      <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg-muted">
        {/*
          `sessions.updated_at`, not `session_devices.last_seen_at` — the
          latter is written once at insert and would print the login time
          again under a heading that says «آخر نشاط».

          «—», not `dateTime(null)`. `dateTime` renders null as «ولا مرة»
          («never»), which is right where null means "this has not happened".
          Here it means the `Session` row is GONE — an ordinary sign-out, an
          expiry, or a revoke — so the activity is unknown, not absent. The
          old rendering printed «آخر نشاط: ولا مرة» in the same row as a real
          login timestamp, which is a contradiction on its face.
        */}
        {device.lastActiveAt === null ? c.unknown : dateTime(device.lastActiveAt)}
      </td>
    </tr>
  );
}

/**
 * Every lesson they opened, most recent first — «شاف إيه، وقعد قد إيه».
 *
 * The course rollup above answers "four of twelve"; this answers WHICH four,
 * which is the question that actually gets asked and cannot be derived from
 * the rollup.
 */
function LessonsTable({ lessons }: { lessons: StudentAnalyticsDetail['lessons'] }) {
  return (
    <section>
      <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
        {c.recordLessonsTitle}
      </h2>
      <p className="mt-1 mb-3 max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">
        {c.recordLessonsHint}
      </p>

      {lessons.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">
          {c.noData}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[48rem] text-[length:var(--fs-text-sm)]">
            <thead className="bg-surface-3">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium text-fg-muted">
                  {c.columnLesson}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnState}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnProgress}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnWatched}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnOpens}
                </th>
                <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
                  {c.columnLastSeen}
                </th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson) => (
                <tr
                  key={`${lesson.courseId}:${lesson.lessonId}`}
                  className="border-t border-line-subtle hover:bg-surface-2"
                >
                  <th scope="row" className="max-w-80 px-3 py-2 text-start font-normal">
                    <Link
                      href={`/admin/analytics/lessons/${lesson.lessonId}`}
                      className="block truncate text-fg hover:text-accent-text"
                    >
                      {lesson.lessonTitle}
                    </Link>
                    <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                      {lesson.courseTitle}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-end">
                    <span
                      className={cn(
                        'text-[length:var(--fs-text-xs)]',
                        // Colour with the label beside it, never colour alone,
                        // and `failed` is the only state that earns the error
                        // colour — `in_progress` is not a failure.
                        lesson.state === 'passed' && 'text-[color:var(--ok)]',
                        lesson.state === 'failed' && 'text-[color:var(--err)]',
                        lesson.state !== 'passed' && lesson.state !== 'failed' && 'text-fg-muted',
                      )}
                    >
                      {c.progressStates[lesson.state as ProgressState] ?? lesson.state}
                    </span>
                    {lesson.completedVia ? (
                      <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                        {c.completedVia[lesson.completedVia as CompletedVia] ?? lesson.completedVia}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular px-3 py-2 text-end">{pct(lesson.completion)}</td>
                  <td className="tabular px-3 py-2 text-end whitespace-nowrap">
                    {duration(lesson.watchedSeconds)}
                  </td>
                  <td className="tabular px-3 py-2 text-end whitespace-nowrap">
                    {/* Count and unit as two elements — one string of a number
                        plus an Arabic word is a bidi transposition waiting to
                        happen in a right-aligned cell. */}
                    <span className="tabular">{num(lesson.openCount)}</span>{' '}
                    <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                      {c.timesShort}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg-muted">
                    {dateTime(lesson.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Every sitting, including the ones never handed in — see the service for why
 *  the aggregates above deliberately count fewer rows than this table lists. */
function AttemptsTable({ attempts }: { attempts: StudentAnalyticsDetail['attempts'] }) {
  return (
    <section>
      <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold text-fg">
        {c.attemptsTitle}
      </h2>
      {attempts.length === 0 ? (
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
              {attempts.map((attempt) => (
                <tr
                  key={attempt.attemptId}
                  className="border-t border-line-subtle hover:bg-surface-2"
                >
                  <th scope="row" className="max-w-72 px-3 py-2 text-start font-normal">
                    {/* Straight to the paper this sitting was drawn from — the
                        question a row like this always raises next. */}
                    <Link
                      href={`/admin/quizzes/${attempt.quizId}/analytics`}
                      className="block truncate text-fg hover:text-accent-text"
                    >
                      {attempt.quizTitle}
                    </Link>
                  </th>
                  <td className="tabular px-3 py-2 text-end">{num(attempt.attemptNo)}</td>
                  <td className="px-3 py-2 text-end">
                    <span
                      className={cn(
                        'text-[length:var(--fs-text-xs)]',
                        // Status colour, with the label right beside it —
                        // never colour alone. `passed === false` is a real
                        // fail; a null is "not decided yet", which is not the
                        // same thing and must not wear the fail colour.
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
  );
}

/**
 * «فوق المتوسط بـ ٪١٢». Returns the cohort figure alone when the student has no
 * value of their own — the comparison would be meaningless, but the benchmark
 * is still worth showing.
 */
function compare(value: number | null, cohortValue: number | null): string {
  if (cohortValue === null) return '';
  if (value === null) return `${c.cohortAverage}: ${pct(cohortValue)}`;
  const delta = value - cohortValue;
  if (Math.abs(delta) < 0.005) return c.sameAsCohort;
  const template = delta > 0 ? c.above : c.below;
  return formatCopy(template, { n: pct(Math.abs(delta)) });
}
