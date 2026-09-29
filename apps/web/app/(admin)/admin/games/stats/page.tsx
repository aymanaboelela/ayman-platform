import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { Crown, HeartPulse, Info, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { GAME_STATS_MIN_ANSWERS, GameStatsSchema } from '@ayman/contracts/quiz/game-stats';
import { AreaChart } from '@/components/admin/charts/area-chart';
import { BarList } from '@/components/admin/charts/bar-list';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { ColumnChart } from '@/components/admin/charts/column-chart';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { duration, num, pct, shortDate } from '@/components/admin/charts/format';
import { sequentialColor, seriesColor } from '@/components/admin/charts/palette';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { getAdminCourseHeadcount } from '@/lib/admin-overview';
import { PeriodSwitcher } from '../../analytics/videos/period-switcher';
import { GamesTabs } from '../games-tabs';
import { CourseFilter } from './course-filter';
import { gameStatsCache } from './search-params';
import { HardestList, ModeCard, PlayerList, SessionsTable } from './stats-bits';

const c = copy.admin.games;
const a = copy.analytics;

export const metadata: Metadata = { title: c.statsTitle };

/** `٩ م` — الساعة اللي الجولة بدأت فيها. UTC لأن الساعة جاية من الـAPI بتوقيت القاهرة خلاص. */
const HOUR = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', hour12: true, timeZone: 'UTC' });
const hourName = (hour: number) => HOUR.format(new Date(Date.UTC(2026, 0, 1, hour)));

const MODE_ICON = { millionaire: Crown, race: Zap, survival: HeartPulse } as const;
const MODE_TONE = { millionaire: 'var(--viz-3)', race: 'var(--viz-4)', survival: 'var(--viz-2)' } as const;

/**
 * «إحصائيات الألعاب» — «عاوز أعرف مين اللي بيدخل يلعب وبيقعد قد إيه، وكل
 * الإحصائيات».
 *
 * ترتيب القراية: الأرقام الأربعة (كام جولة، كام طالب، وقت اللعب، نسبة الصح)،
 * بعدين إمتى (يوم بيوم، وبالساعة)، بعدين كل لعبة، بعدين مين (الأكتر لعبًا،
 * الأكتر وقتًا، الأعلى نتيجة)، بعدين آخر الجولات، وفي الآخر أصعب الأسئلة —
 * اللي هي اللي المدرّس هيعمل بيها حاجة.
 */
export default async function GameStatsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period, courseId } = gameStatsCache.parse(await searchParams);
  const query = new URLSearchParams({ period });
  if (courseId) query.set('courseId', courseId);
  const [stats, courses] = await Promise.all([
    adminGetOrForbidden(`/api/admin/game-stats?${query.toString()}`, GameStatsSchema),
    getAdminCourseHeadcount(),
  ]);
  if (stats === null) return null;

  const { totals } = stats;
  const hourMax = Math.max(1, ...stats.byHour);

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.statsTitle}</h1>
        <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.statsLead}</p>
      </header>

      <GamesTabs active="stats" />

      <div className="mb-2 flex flex-wrap items-start gap-x-4">
        <PeriodSwitcher />
        {courses && courses.length > 0 ? (
          <div className="mb-6">
            <CourseFilter courses={courses.map((course) => ({ id: course.courseId, title: course.title }))} />
          </div>
        ) : null}
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={c.plays}
          value={num(totals.plays)}
          context={totals.players > 0 ? formatCopy(c.playsPerPlayer, { n: num(totals.plays / totals.players, 1) }) : undefined}
          accent
        />
        <StatTile label={c.players} value={num(totals.players)} tint="var(--viz-2)" />
        <StatTile
          label={c.playTime}
          value={duration(totals.seconds)}
          context={`${c.avgPlay}: ${duration(totals.avgSeconds)} · ${formatCopy(c.perPlayer, { n: duration(totals.avgSecondsPerPlayer) })}`}
          tint="var(--viz-3)"
        />
        <StatTile
          label={c.correctRate}
          value={pct(totals.correctRate)}
          context={formatCopy(c.answersOf, { n: num(totals.correct), total: num(totals.answered) })}
          tint="var(--viz-6)"
        />
      </section>

      {totals.plays === 0 ? (
        <p className="mb-6 rounded-lg border border-dashed border-line p-10 text-center text-fg-muted">{c.noPlays}</p>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={c.playsPerDay}
          className="lg:col-span-2"
          isEmpty={totals.plays === 0}
          rows={stats.daily.map((point) => ({ label: shortDate(point.date), value: num(point.plays) }))}
        >
          <AreaChart
            points={stats.daily.map((point) => ({ date: point.date, value: point.plays }))}
            valueLabel={c.playsPerDay}
            unit={c.playsUnit}
          />
        </ChartCard>
        <ChartCard
          title={c.byHour}
          isEmpty={totals.plays === 0}
          rows={stats.byHour.map((n, hour) => ({
            label: formatCopy(a.hourRange, { from: hourName(hour), to: hourName((hour + 1) % 24) }),
            value: num(n),
            share: totals.plays > 0 ? n / totals.plays : null,
          }))}
        >
          <ColumnChart
            columns={stats.byHour.map((n, hour) => ({
              key: String(hour),
              label: hour % 6 === 0 ? num(hour) : '',
              value: n,
              color: sequentialColor(0.25 + (n / hourMax) * 0.75),
              tooltip: formatCopy(a.hourRange, { from: hourName(hour), to: hourName((hour + 1) % 24) }),
            }))}
            unit={c.playsUnit}
          />
        </ChartCard>
      </div>

      <section className="mb-6">
        <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.byMode}</h2>
        <p className="mb-3 mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.byModeHint}</p>
        <div className="grid gap-3 md:grid-cols-3">
          {stats.byMode.map((row) => (
            <ModeCard key={row.mode} row={row} icon={MODE_ICON[row.mode]} tone={MODE_TONE[row.mode]} />
          ))}
        </div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <PlayerList title={c.topPlays} rows={stats.topByPlays} metric="plays" tone="var(--viz-1)" />
        <PlayerList title={c.topTime} rows={stats.topByTime} metric="seconds" tone="var(--viz-2)" />
        <div className="flex flex-col gap-4">
          {(['millionaire', 'race', 'survival'] as const).map((mode) => (
            <PlayerList
              key={mode}
              title={`${c.topScore} — ${mode === 'millionaire' ? c.modeMillionaire : mode === 'race' ? c.modeRace : c.modeSurvival}`}
              rows={stats.topByScore[mode].slice(0, 5)}
              metric="score"
              tone={MODE_TONE[mode]}
            />
          ))}
        </div>
      </div>

      {stats.byCourse.length > 1 ? (
        <ChartCard
          title={c.byCourse}
          className="mb-6"
          isEmpty={false}
          rows={stats.byCourse.map((row, index) => ({
            label: row.title ?? c.allCoursesRound,
            value: num(row.plays),
            share: totals.plays > 0 ? row.plays / totals.plays : null,
            color: seriesColor(index),
          }))}
        >
          <BarList
            ariaLabel={c.byCourse}
            rows={stats.byCourse.map((row, index) => ({
              key: row.courseId ?? 'all',
              label: row.title ?? c.allCoursesRound,
              value: row.plays,
              display: num(row.plays),
              displayNote: duration(row.seconds),
              color: seriesColor(index),
              meta: formatCopy(c.playsPerPlayer, { n: num(row.players > 0 ? row.plays / row.players : 0, 1) }),
            }))}
          />
        </ChartCard>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-3 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.recent}</h2>
        <SessionsTable rows={stats.recent} />
      </section>

      <section className="mb-6">
        <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{c.hardest}</h2>
        <p className="mb-3 mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(c.hardestHint, { n: num(GAME_STATS_MIN_ANSWERS) })}
        </p>
        <HardestList rows={stats.hardest} />
      </section>

      <p className="flex items-start gap-1.5 text-[length:var(--fs-text-xs)] leading-relaxed text-fg-subtle">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {c.definition}
      </p>
    </div>
  );
}
