import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  BookOpenCheck,
  CalendarDays,
  Clock,
  ListChecks,
  Medal,
  Sparkles,
  StickyNote,
  Target,
  TrendingUp,
  Trophy,
  type LucideProps,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import type { RecapPayload } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { CountUp } from '@/components/rank/count-up';
import { recapMonthLabel, watchText } from '@/lib/engagement/format';
import type { ShareBrand } from '@/lib/share-card/model';
import { RecapShare } from './recap-share';

const c = engagementCopy.recap;

/** «الساعة ١٠ بالليل». */
function hourText(hour: number): string {
  const part =
    hour < 5 ? c.hour.lateNight : hour < 12 ? c.hour.morning : hour < 15 ? c.hour.noon : hour < 18 ? c.hour.afternoon : c.hour.evening;
  return `${formatCopy(c.hour.at, { h: hour % 12 === 0 ? 12 : hour % 12 })} ${part}`;
}

interface Tile {
  key: string;
  icon: ComponentType<LucideProps>;
  label: string;
  value: string;
  sub?: string;
  hue: 'amber' | 'teal' | 'violet' | 'rose' | 'blue' | 'green';
}

/**
 * «ملخص الشهر» — a hero with the hours, tiles for the rest, the month picker,
 * and the story image. Tiles for a feature that is off here (the daily card,
 * notes, badges) are left out, never drawn as a zero.
 */
export function RecapView({
  recap,
  studentName,
  brand,
  show,
}: {
  recap: RecapPayload;
  studentName: string;
  brand: ShareBrand;
  show: { daily: boolean; notes: boolean; badges: boolean };
}) {
  const empty = recap.watchMinutes === 0 && recap.lessonsCompleted === 0 && recap.quizzesTaken === 0 && recap.activeDays === 0;
  const tiles: Tile[] = [
    { key: 'lessons', icon: BookOpenCheck, label: c.tiles.lessons, value: String(recap.lessonsCompleted), hue: 'blue' },
    { key: 'quizzes', icon: ListChecks, label: c.tiles.quizzes, value: String(recap.quizzesTaken), hue: 'violet' },
    {
      key: 'activeDays',
      icon: CalendarDays,
      label: c.tiles.activeDays,
      value: String(recap.activeDays),
      sub: formatCopy(c.tiles.activeOf, { total: recap.daysInMonth }),
      hue: 'teal',
    },
    {
      key: 'average',
      icon: TrendingUp,
      label: c.tiles.average,
      value: recap.averagePercent === null ? '—' : `${recap.averagePercent}%`,
      hue: 'amber',
    },
    ...(recap.best
      ? [{ key: 'best', icon: Trophy, label: c.tiles.best, value: `${recap.best.percent}%`, sub: recap.best.title, hue: 'rose' as const }]
      : []),
    ...(show.daily
      ? [
          {
            key: 'daily',
            icon: Sparkles,
            label: c.tiles.daily,
            value: String(recap.dailyAnswered),
            sub: formatCopy(c.tiles.dailyOf, { right: recap.dailyRight, answered: recap.dailyAnswered }),
            hue: 'amber' as const,
          },
        ]
      : []),
    ...(show.notes ? [{ key: 'notes', icon: StickyNote, label: c.tiles.notes, value: String(recap.notesWritten), hue: 'violet' as const }] : []),
    ...(show.badges ? [{ key: 'badges', icon: Medal, label: c.tiles.badges, value: String(recap.badgesEarned), hue: 'rose' as const }] : []),
    ...(recap.topCourse
      ? [{ key: 'top', icon: Target, label: c.tiles.topCourse, value: watchText(recap.topCourse.minutes), sub: recap.topCourse.title, hue: 'green' as const }]
      : []),
    ...(recap.peakHour !== null
      ? [{ key: 'peak', icon: Clock, label: c.tiles.peakHour, value: hourText(recap.peakHour), hue: 'blue' as const }]
      : []),
  ];

  const s = c.share.story;
  const storyTiles = [
    { value: String(recap.lessonsCompleted), label: s.lessons },
    { value: String(recap.quizzesTaken), label: s.quizzes },
    { value: String(recap.activeDays), label: s.days },
    { value: recap.best ? `${recap.best.percent}%` : '—', label: s.best },
  ];

  return (
    <>
      <nav className="eg-months" aria-label={c.month}>
        {recap.months.map((month) => (
          <Link
            key={month}
            href={`/recap?month=${month}`}
            className="eg-month"
            aria-current={month === recap.month ? 'page' : undefined}
          >
            {recapMonthLabel(month, false)}
          </Link>
        ))}
      </nav>

      <section className="eg-hero" data-hue="teal">
        <div className="eg-hero__shapes" aria-hidden="true">
          <span className="eg-shape eg-shape--ring" />
          <span className="eg-shape eg-shape--blob" />
        </div>
        <span className="eg-hero__pill">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {recapMonthLabel(recap.month)}
          {recap.partial ? ` · ${c.partial}` : ''}
        </span>
        <p className="eg-hero__total">
          <span className="eg-hero__num eg-hero__num--text">{watchText(recap.watchMinutes)}</span>
          <span className="eg-hero__label">{c.heroLabel}</span>
        </p>
        {!empty ? (
          <div className="eg-hero__actions">
            <RecapShare
              label={c.share.button}
              title={c.share.title}
              fileName={`recap-${recap.month}`}
              input={{
                studentName,
                qr: brand.qr,
                text: {
                  platform: brand.platform,
                  heading: formatCopy(s.heading, { month: recapMonthLabel(recap.month, false) }),
                  watchValue: watchText(recap.watchMinutes),
                  watchLabel: s.watch,
                  tiles: storyTiles,
                  dailyLine:
                    show.daily && recap.dailyAnswered > 0
                      ? `${s.streak}: ${formatCopy(c.tiles.dailyOf, { right: recap.dailyRight, answered: recap.dailyAnswered })}`
                      : null,
                  studyWith: formatCopy(copy.shareCard.studyWith, { teacher: brand.teacher }),
                  siteHost: brand.siteHost,
                  qrHint: s.qrHint,
                },
              }}
            />
          </div>
        ) : null}
      </section>

      {empty ? (
        <section className="eg-empty">
          <span className="eg-empty__badge" aria-hidden="true">
            <CalendarDays className="size-8" />
          </span>
          <h2 className="eg-empty__title">{c.empty.title}</h2>
          <p className="eg-empty__body">{c.empty.body}</p>
          <Link href="/library" className="eg-btn eg-btn--solid">
            {c.empty.cta}
          </Link>
        </section>
      ) : (
        <ul className="eg-tiles">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <li key={tile.key} className="eg-tile" data-hue={tile.hue}>
                <span className="eg-tile__icon" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="eg-tile__value">
                  {/^\d+$/.test(tile.value) ? <CountUp to={Number(tile.value)} /> : tile.value}
                </span>
                <span className="eg-tile__label">{tile.label}</span>
                {tile.sub ? <span className="eg-tile__sub">{tile.sub}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
