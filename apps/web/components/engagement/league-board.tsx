import { BookOpenCheck, CircleCheckBig, ClipboardPen, Crown, Sparkles, Timer, Trophy, Medal } from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { LEAGUE_POINTS, type LeaguePayload, type LeagueRow, type LeagueSource } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { UserAvatar } from '@/components/app/user-avatar';
import { CountUp } from '@/components/rank/count-up';
import { yearLabelAr } from '@/lib/year-label';
import { LeaguePrivacy } from './league-privacy';

const c = engagementCopy.league;

const SOURCE_ICON: Record<LeagueSource, ComponentType<LucideProps>> = {
  lesson: BookOpenCheck,
  quiz: CircleCheckBig,
  homework: ClipboardPen,
  daily: Sparkles,
  dailyRight: Crown,
  focus: Timer,
};

const SOURCES = Object.keys(LEAGUE_POINTS) as LeagueSource[];

/** Formatted on the server only, so no device zone can mismatch hydration. */
const dayMonth = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function Row({ row }: { row: LeagueRow }) {
  const name = row.name ?? c.hiddenName;
  return (
    <li className="eg-rank" data-me={row.me} data-top={row.rank <= 3 ? row.rank : undefined}>
      <span className="eg-rank__place eg-ltr-num">{row.rank}</span>
      <UserAvatar name={name} image={row.image} size={36} />
      <span className="eg-rank__name">
        {name}
        {row.me ? <span className="eg-rank__me">{c.me.self}</span> : null}
      </span>
      <span className="eg-rank__points">
        <span className="eg-ltr-num">{row.points}</span> {c.me.points}
      </span>
    </li>
  );
}

/**
 * «دوري الأسبوع» — the reader's place and points on top, the table under it,
 * where the points come from, last week's three, and the switch that takes a
 * name off the table. A server component: only the switch is interactive.
 */
export function LeagueBoard({ league }: { league: LeaguePayload }) {
  const { me } = league;
  const top = league.rows.filter((row) => row.rank <= 3).slice(0, 3);
  return (
    <>
      <section className="eg-hero" data-hue="amber">
        <div className="eg-hero__shapes" aria-hidden="true">
          <span className="eg-shape eg-shape--ring" />
          <span className="eg-shape eg-shape--blob" />
        </div>
        <span className="eg-hero__pill">
          <Trophy className="size-3.5" aria-hidden="true" />
          {league.year === null ? c.yearUnknown : formatCopy(c.year, { year: yearLabelAr(league.year) })}
        </span>
        <div className="eg-hero__main">
          <span className="eg-flame" data-lit={me.rank !== null && me.rank <= 3} aria-hidden="true">
            <Trophy className="size-12" />
          </span>
          <p className="eg-hero__total">
            {me.rank === null ? (
              <span className="eg-hero__num eg-hero__num--text">{c.me.unranked}</span>
            ) : (
              <>
                <span className="eg-hero__num">
                  #<CountUp to={me.rank} />
                </span>
                <span className="eg-hero__label">{c.me.rank}</span>
              </>
            )}
          </p>
        </div>
        {me.rank === null ? <p className="eg-hero__sub">{c.me.unrankedHint}</p> : null}
        <div className="eg-hero__chips">
          <span className="eg-hero__chip">
            <span className="eg-ltr-num">{me.points}</span> {c.me.points}
          </span>
          <span className="eg-hero__chip">{arabicCount(league.daysLeft, c.daysLeft)}</span>
          <span className="eg-hero__chip">{arabicCount(league.players, c.players)}</span>
          <span className="eg-hero__chip">
            {dayMonth.format(new Date(`${league.week.from}T00:00:00Z`))} – {dayMonth.format(new Date(`${league.week.to}T00:00:00Z`))}
          </span>
        </div>
      </section>

      {top.length > 0 ? (
        <ol className="eg-podium" aria-label={c.table}>
          {top.map((row) => {
            const name = row.name ?? c.hiddenName;
            return (
              <li key={`${row.rank}-${name}-${row.points}`} className="eg-podium__step" data-place={row.rank} data-me={row.me}>
                <UserAvatar name={name} image={row.image} size={row.rank === 1 ? 64 : 52} className="eg-podium__avatar" />
                <span className="eg-podium__name">{name}</span>
                <span className="eg-podium__points">
                  <span className="eg-ltr-num">{row.points}</span> {c.me.points}
                </span>
                <span className="eg-podium__block eg-ltr-num">{row.rank}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <section className="eg-card">
        <header className="eg-card__head">
          <span className="eg-panel__icon" data-hue="amber" aria-hidden="true">
            <Medal className="size-5" />
          </span>
          <h2 className="eg-card__title">{c.table}</h2>
        </header>
        {league.rows.length === 0 ? (
          <p className="eg-muted-line">{c.empty}</p>
        ) : (
          <ol className="eg-ranks">
            {league.rows.map((row, index) => (
              <Row key={`${index}-${row.rank}`} row={row} />
            ))}
          </ol>
        )}
      </section>

      <section className="eg-card">
        <header className="eg-card__head">
          <span className="eg-panel__icon" data-hue="amber" aria-hidden="true">
            <Sparkles className="size-5" />
          </span>
          <h2 className="eg-card__title">{c.howTitle}</h2>
        </header>
        <ul className="eg-sources">
          {SOURCES.map((source) => {
            const Icon = SOURCE_ICON[source];
            return (
              <li key={source} className="eg-source">
                <span className="eg-row__icon" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="eg-source__name">{c.sources[source]}</span>
                <span className="eg-source__each eg-ltr-num">{formatCopy(c.each, { n: LEAGUE_POINTS[source] })}</span>
                <span className="eg-source__mine eg-ltr-num">
                  ×{me.counts[source]} = {me.counts[source] * LEAGUE_POINTS[source]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {league.lastWeek.length > 0 ? (
        <section className="eg-card">
          <header className="eg-card__head">
            <span className="eg-panel__icon" data-hue="amber" aria-hidden="true">
              <Crown className="size-5" />
            </span>
            <h2 className="eg-card__title">{c.lastWeek}</h2>
          </header>
          <ol className="eg-ranks">
            {league.lastWeek.map((row, index) => (
              <Row key={`last-${index}`} row={row} />
            ))}
          </ol>
        </section>
      ) : null}

      <LeaguePrivacy hidden={me.hidden} />
    </>
  );
}
