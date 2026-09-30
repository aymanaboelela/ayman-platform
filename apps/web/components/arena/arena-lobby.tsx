'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { BookOpen, Flame, Scale, Swords, Timer, Trophy, UserRound, XCircle, Zap } from 'lucide-react';
import { ARENA_RULES, type ArenaLobby as Lobby } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { ArenaBoard } from './arena-board';
import { ArenaEmblem, Fighter, Num, SoundButton } from './arena-bits';
import type { ArenaErrorCode } from './use-arena-live';
import type { ArenaSound } from './use-arena-sound';

const c = arenaCopy.lobby;
const NUM = new Intl.NumberFormat('en-US');

/**
 * اللوبي: الهيرو الغامق (شعار، «صفّك»، صورتك ونقطك وترتيبك)، الكورس اللي
 * هنلعب فيه، زرار «يلا نبدأ» الكبير، القواعد، وأبطال الساحة.
 */
export function ArenaLobby({
  lobby,
  courseId,
  onCourse,
  onStart,
  error,
  sound,
}: {
  lobby: Lobby;
  courseId: string | null;
  onCourse: (id: string) => void;
  onStart: () => void;
  error: ArenaErrorCode | null;
  sound: ArenaSound;
}) {
  const { me } = lobby;
  const playable = lobby.courses.filter((course) => course.playable);
  const capPct = Math.min(100, Math.round((me.todayPoints / ARENA_RULES.dailyPointsCap) * 100));

  return (
    <div className="ca-lobby">
      <section className="ca-hero" aria-labelledby="ca-title">
        <span className="ca-hero__glow" aria-hidden="true" />
        {/* The mute switch alone in the corner. «تحدّي مباشر» moved into the
            text column as its eyebrow: sharing this row put it directly over
            the shield, where the ripples crossed it. */}
        <div className="ca-hero__top">
          <SoundButton sound={sound} />
        </div>

        <div className="ca-hero__main">
          {/* The ripples belong to the shield, so they live in its box and
              centre on it — positioned against the whole card they sat a
              fixed offset from a shield whose place moves with the padding
              and the badge row, and crossed «تحدّي مباشر» instead. */}
          <span className="ca-hero__mark">
            <span className="ca-hero__rings" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <ArenaEmblem className="ca-hero__emblem" />
          </span>
          <div className="ca-hero__text">
            <span className="ca-badge ca-hero__eyebrow">
              <Swords className="size-4" aria-hidden="true" />
              {c.eyebrow}
            </span>
            <h1 id="ca-title" className="ca-hero__title">
              {c.title}
            </h1>
            <p className="ca-hero__lead">{c.lead}</p>
            <p className="ca-cohort">
              <UserRound className="size-4" aria-hidden="true" />
              {lobby.cohort ? formatCopy(c.cohort, { label: lobby.cohort.label }) : c.cohortUnknown}
            </p>
          </div>
        </div>

        <div className="ca-me">
          <Fighter player={{ name: me.name, image: me.image }} side="you" size={64} />
          <div className="ca-me__stats">
            <div className="ca-me__stat" data-tone="gold">
              <span className="ca-me__label">{c.pointsLabel}</span>
              <Num value={NUM.format(me.points)} className="ca-me__value" />
            </div>
            <div className="ca-me__stat" data-tone="violet">
              <span className="ca-me__label">{c.rankLabel}</span>
              {me.rank ? <Num value={`#${me.rank}`} className="ca-me__value" /> : <span className="ca-me__value">{c.rankNone}</span>}
            </div>
            <div className="ca-me__record">
              {formatCopy(c.record, { wins: NUM.format(me.wins), draws: NUM.format(me.draws), losses: NUM.format(me.losses) })}
            </div>
            <div className="ca-me__today" style={{ '--pct': `${capPct}%` } as CSSProperties}>
              <span className="ca-me__today-bar" aria-hidden="true" />
              <span>{formatCopy(c.today, { n: NUM.format(me.todayPoints), cap: NUM.format(ARENA_RULES.dailyPointsCap) })}</span>
            </div>
          </div>
        </div>
      </section>

      {lobby.blocked ? (
        <Blocked kind={lobby.blocked} />
      ) : playable.length === 0 ? (
        <section className="ca-card ca-blocked">
          <XCircle className="ca-blocked__icon" aria-hidden="true" />
          <h2 className="ca-card__title">{c.noCoursesTitle}</h2>
          <p className="ca-card__sub">{formatCopy(c.noCoursesBody, { n: ARENA_RULES.minPool })}</p>
        </section>
      ) : (
        <section className="ca-card ca-play" aria-labelledby="ca-course-title">
          <header className="ca-card__head">
            <span className="ca-card__icon" data-tone="teal">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <h2 id="ca-course-title" className="ca-card__title">
              {c.chooseCourse}
            </h2>
          </header>
          <div className="ca-courses" role="radiogroup" aria-labelledby="ca-course-title">
            {lobby.courses.map((course, index) => (
              <button
                key={course.id}
                type="button"
                role="radio"
                aria-checked={courseId === course.id}
                disabled={!course.playable}
                className="ca-course"
                data-tone={index % 4}
                onClick={() => onCourse(course.id)}
              >
                <span className="ca-course__title">{course.title}</span>
                <span className="ca-course__meta">
                  {course.playable ? formatCopy(c.courseQuestions, { n: NUM.format(course.questions) }) : c.courseTooFew}
                </span>
              </button>
            ))}
          </div>

          <button type="button" className="ca-start" onClick={onStart} disabled={!courseId}>
            <span className="ca-start__shine" aria-hidden="true" />
            <Zap className="size-6" aria-hidden="true" />
            {c.start}
          </button>
          <p className="ca-start__hint">{c.startHint}</p>
          {error ? <p className="ca-error" role="alert">{errorText(error)}</p> : null}
        </section>
      )}

      <section className="ca-card ca-rules" aria-labelledby="ca-rules-title">
        <header className="ca-card__head">
          <span className="ca-card__icon" data-tone="rose">
            <Flame className="size-5" aria-hidden="true" />
          </span>
          <h2 id="ca-rules-title" className="ca-card__title">
            {c.rulesTitle}
          </h2>
        </header>
        <ul className="ca-rules__list">
          <li data-tone="teal">
            <Timer className="size-5" aria-hidden="true" />
            {formatCopy(c.ruleQuestions, { n: ARENA_RULES.questions, s: ARENA_RULES.questionMs / 1000 })}
          </li>
          <li data-tone="gold">
            <Zap className="size-5" aria-hidden="true" />
            {c.ruleFirst}
          </li>
          <li data-tone="rose">
            <Swords className="size-5" aria-hidden="true" />
            {c.ruleWrong}
          </li>
          <li data-tone="violet">
            <Trophy className="size-5" aria-hidden="true" />
            {formatCopy(c.rulePoints, { win: ARENA_RULES.points.win, draw: ARENA_RULES.points.draw })}
          </li>
          <li data-tone="blue">
            <Scale className="size-5" aria-hidden="true" />
            {c.ruleSeparate}
          </li>
        </ul>
      </section>

      <ArenaBoard board={lobby.board} />
    </div>
  );
}

function Blocked({ kind }: { kind: 'no_year' | 'no_subscription' }) {
  const year = kind === 'no_year';
  return (
    <section className="ca-card ca-blocked">
      <XCircle className="ca-blocked__icon" aria-hidden="true" />
      <h2 className="ca-card__title">{year ? c.blockedYearTitle : c.blockedSubTitle}</h2>
      <p className="ca-card__sub">{year ? c.blockedYearBody : c.blockedSubBody}</p>
      <Link className="ca-btn ca-btn--primary" href={year ? '/profile' : '/courses'}>
        {year ? c.blockedYearCta : c.blockedSubCta}
      </Link>
    </section>
  );
}

function errorText(code: ArenaErrorCode): string {
  if (code === 'no_year') return c.blockedYearBody;
  if (code === 'no_subscription') return c.blockedSubBody;
  if (code === 'course_not_playable') return c.courseTooFew;
  if (code === 'no_questions') return arenaCopy.result.noQuestionsBody;
  return c.closedBody;
}
