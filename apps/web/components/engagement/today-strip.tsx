import type { ComponentType } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, Flame, Medal, Sparkles, type LucideProps } from 'lucide-react';
import type { Entitlements } from '@ayman/contracts/admin/entitlements';
import { arabicCount } from '@ayman/contracts/arabic-count';
import {
  DailyPayloadSchema,
  RecapPayloadSchema,
  StudyPlanPayloadSchema,
  type DailyPayload,
  type RecapPayload,
  type StudyPlanPayload,
} from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { apiGetAuthed } from '@/lib/api-server';
import { recapMonthLabel } from '@/lib/engagement/format';
import './engagement.css';

const c = engagementCopy.dashboard;

/** The recap banner shows during a month's first week, about the month that ended. */
const RECAP_BANNER_DAYS = 7;

const cairoDayOfMonth = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'Africa/Cairo' });

/** A dashboard read that is an extra, never a reason for the page to fail. */
async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    return null;
  }
}

function Row({
  href,
  icon: Icon,
  hue,
  lit,
  title,
  line,
  cta,
}: {
  href: string;
  icon: ComponentType<LucideProps>;
  hue: 'amber' | 'blue' | 'teal' | 'rose';
  lit?: boolean;
  title: string;
  line: string;
  cta: string;
}) {
  return (
    <li className="eg-strip__row" data-hue={hue}>
      <span className="eg-strip__icon" data-lit={lit ?? true} aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eg-strip__title">{title}</p>
        <p className="eg-strip__line">{line}</p>
      </div>
      <Link href={href} className="eg-strip__cta">
        <span>{cta}</span>
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}

function dailyRow(daily: DailyPayload) {
  const { streak } = daily;
  const line =
    streak.current > 0
      ? `${streak.todayDone ? c.daily.done : c.daily.pending} · ${arabicCount(streak.current, c.daily.streak)}`
      : streak.todayDone
        ? c.daily.done
        : c.daily.noStreak;
  return (
    <Row
      key="daily"
      href="/daily"
      icon={Flame}
      hue="amber"
      lit={streak.current > 0 || streak.todayDone}
      title={c.daily.title}
      line={line}
      cta={streak.todayDone ? c.daily.ctaDone : c.daily.cta}
    />
  );
}

function planRow(plan: StudyPlanPayload) {
  if (!plan.settings || plan.status === 'past') {
    return <Row key="plan" href="/plan" icon={CalendarCheck} hue="blue" title={c.plan.title} line={c.plan.none} cta={c.plan.ctaNone} />;
  }
  const today = plan.days[0];
  const owed = today?.kind === 'study' ? today.items.length : 0;
  const todayLine = owed > 0 ? arabicCount(owed, c.plan.today) : plan.doneToday > 0 ? c.plan.quotaDone : null;
  const left = arabicCount(plan.daysLeft ?? 0, c.plan.left);
  return (
    <Row
      key="plan"
      href="/plan"
      icon={CalendarCheck}
      hue="blue"
      title={c.plan.title}
      line={todayLine ? `${left} · ${todayLine}` : left}
      cta={c.plan.cta}
    />
  );
}

function recapRow(recap: RecapPayload) {
  return (
    <Row
      key="recap"
      href={`/recap?month=${recap.month}`}
      icon={Sparkles}
      hue="teal"
      title={formatCopy(c.recap.title, { month: recapMonthLabel(recap.month, false) })}
      line={c.recap.body}
      cta={c.recap.cta}
    />
  );
}

/**
 * «النهارده» — the daily habits in the dashboard's aside: the day's question
 * and its streak, the plan's share for today, and, in a month's first week,
 * the recap of the month that just ended.
 *
 * In the ASIDE, not the main column: the page keeps exactly one amber action
 * (the resume card), and these rows are tinted per feature rather than amber.
 * Streamed in its own Suspense boundary, so three extra reads never hold the
 * greeting back, and each read failing is the row missing — never the page.
 */
export async function TodayStrip({ features }: { features: Entitlements }) {
  const day = Number(cairoDayOfMonth.format(new Date()));
  const [daily, plan, recap] = await Promise.all([
    features.dailyQuestion ? orNull(apiGetAuthed('/api/me/daily', DailyPayloadSchema)) : null,
    features.studyPlan ? orNull(apiGetAuthed('/api/me/plan', StudyPlanPayloadSchema)) : null,
    features.monthlyRecap && day <= RECAP_BANNER_DAYS ? orNull(apiGetAuthed('/api/me/recap', RecapPayloadSchema)) : null,
  ]);

  const rows = [
    daily && daily.question !== null ? dailyRow(daily) : null,
    plan ? planRow(plan) : null,
    // The API opens on the ended month only when it had something in it.
    recap && !recap.partial ? recapRow(recap) : null,
    features.badges ? (
      <Row key="badges" href="/badges" icon={Medal} hue="rose" title={c.badges.title} line={c.badges.line} cta={c.badges.cta} />
    ) : null,
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <section className="eg-strip" aria-labelledby="eg-today">
      <h2 id="eg-today" className="eg-strip__head">
        {c.title}
      </h2>
      <ul className="eg-strip__rows">{rows}</ul>
    </section>
  );
}
