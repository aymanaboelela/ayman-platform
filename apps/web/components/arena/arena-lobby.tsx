'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { BookOpen, Check, Flag, Flame, Handshake, Scale, Swords, Timer, Trophy, UserRound, Users, XCircle, Zap } from 'lucide-react';
import { ARENA_RULES, type ArenaCourse, type ArenaLobby as Lobby } from '@ayman/contracts/arena';
import { encodeArenaIntent, type ArenaOpenChallenge } from '@ayman/contracts/arena-challenges';
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
 * هنلعب فيه، وبعدين:
 *   · كورس من غير «تحديات» — زرار «يلا نبدأ» الكبير على الكورس كله، زي الأول.
 *   · كورس فيه تحديات — كارت لكل تحدّي بزرار «يلا» لوحده، و«تحدّي من
 *     اختيارك» (تحدّي أو أكتر يتفتح للدفعة).
 * وفوقهم تحديات الدفعة المفتوحة بزرار «قبول» لكل واحد، وتحت القواعد وأبطال
 * الساحة.
 *
 * كل «يلا» بتبعت `ArenaIntent` (`arena-challenges.ts`) — نفس اللي بيرجّع
 * الطالب لمكانه لو السيرفر اتعمله ريستارت.
 */
export function ArenaLobby({
  lobby,
  courseId,
  onCourse,
  onPlay,
  error,
  sound,
}: {
  lobby: Lobby;
  courseId: string | null;
  onCourse: (id: string) => void;
  onPlay: (intent: string) => void;
  error: ArenaErrorCode | null;
  sound: ArenaSound;
}) {
  const { me } = lobby;
  const playable = lobby.courses.filter((course) => course.playable);
  const selected = lobby.courses.find((course) => course.id === courseId) ?? null;
  const topical = selected && (selected.topics ?? []).length > 0 ? selected : null;
  const challenges = lobby.challenges ?? [];
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

      {!lobby.blocked && challenges.length > 0 ? (
        <OpenChallenges challenges={challenges} onAccept={(id) => onPlay(encodeArenaIntent({ kind: 'challenge', challengeId: id }))} />
      ) : null}

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

          {topical ? (
            <Topics course={topical} onPlay={onPlay} />
          ) : (
            <>
              <button
                type="button"
                className="ca-start"
                onClick={() => courseId && onPlay(encodeArenaIntent({ kind: 'course', courseId }))}
                disabled={!courseId}
              >
                <span className="ca-start__shine" aria-hidden="true" />
                <Zap className="size-6" aria-hidden="true" />
                {c.start}
              </button>
              <p className="ca-start__hint">{c.startHint}</p>
            </>
          )}
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

/**
 * تحديات الكورس: كارت لكل تحدّي بلونه وزرار «يلا» (طابور التحدّي ده)، وتحتهم
 * «تحدّي من اختيارك» — تحدّي أو أكتر، وزرار واحد يفتحه للدفعة.
 */
function Topics({ course, onPlay }: { course: ArenaCourse; onPlay: (intent: string) => void }) {
  const topics = course.topics ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = topics.filter((topic) => picked.includes(topic.id));
  // سقف تقريبي (التحديات ممكن تتداخل) — السيرفر بيقول الحقيقة لو أقل.
  const enough = chosen.reduce((sum, topic) => sum + topic.questions, 0) >= ARENA_RULES.minPool;
  return (
    <div className="ca-topics-wrap">
      <h3 className="ca-topics__title">{c.topicsTitle}</h3>
      <p className="ca-card__sub">{c.topicsLead}</p>
      <ul className="ca-topics">
        {topics.map((topic, index) => (
          <li key={topic.id} className="ca-topic" data-tone={index % 4} data-off={!topic.playable || undefined}>
            <span className="ca-topic__icon" aria-hidden="true">
              <Flag className="size-5" />
            </span>
            <span className="ca-topic__text">
              <span className="ca-topic__name">{topic.title}</span>
              <span className="ca-topic__meta">
                {topic.playable ? formatCopy(c.courseQuestions, { n: NUM.format(topic.questions) }) : c.topicTooFew}
                {topic.waiting > 0 ? (
                  <span className="ca-topic__waiting">
                    <Users className="size-3.5" aria-hidden="true" />
                    {formatCopy(c.topicWaiting, { n: NUM.format(topic.waiting) })}
                  </span>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              className="ca-btn ca-btn--primary ca-topic__go"
              disabled={!topic.playable}
              onClick={() => onPlay(encodeArenaIntent({ kind: 'topic', courseId: course.id, topicId: topic.id }))}
            >
              <Zap className="size-4" aria-hidden="true" />
              {c.topicPlay}
            </button>
          </li>
        ))}
      </ul>

      <div className="ca-create">
        <h3 className="ca-topics__title">
          <Swords className="size-5" aria-hidden="true" />
          {c.createTitle}
        </h3>
        <p className="ca-card__sub">{c.createLead}</p>
        <div className="ca-create__chips" role="group" aria-label={c.createPick}>
          {topics.map((topic) => {
            const on = picked.includes(topic.id);
            return (
              <button
                key={topic.id}
                type="button"
                className="ca-chip"
                aria-pressed={on}
                data-on={on || undefined}
                onClick={() => setPicked(on ? picked.filter((id) => id !== topic.id) : [...picked, topic.id])}
              >
                {on ? <Check className="size-4" aria-hidden="true" /> : null}
                {topic.title}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="ca-btn ca-btn--primary"
          disabled={!enough}
          onClick={() => onPlay(encodeArenaIntent({ kind: 'create', courseId: course.id, topicIds: picked }))}
        >
          <Flag className="size-4" aria-hidden="true" />
          {c.createCta}
        </button>
      </div>
    </div>
  );
}

/** تحديات الدفعة المفتوحة — صف لكل واحد بصاحبه وتحدّياته وزرار «قبول». */
function OpenChallenges({ challenges, onAccept }: { challenges: ArenaOpenChallenge[]; onAccept: (id: string) => void }) {
  return (
    <section className="ca-card ca-open" aria-labelledby="ca-open-title">
      <header className="ca-card__head">
        <span className="ca-card__icon" data-tone="gold">
          <Handshake className="size-5" aria-hidden="true" />
        </span>
        <h2 id="ca-open-title" className="ca-card__title">
          {c.openTitle}
        </h2>
      </header>
      <ul className="ca-open__list">
        {challenges.map((challenge) => (
          <li key={challenge.id} className="ca-open__row" data-mine={challenge.mine || undefined}>
            <Fighter player={challenge.by} side={challenge.mine ? 'you' : 'opponent'} size={40} />
            <span className="ca-open__text">
              <span className="ca-open__by">{challenge.mine ? c.openMine : formatCopy(c.openBy, { name: challenge.by.name })}</span>
              <span className="ca-open__topics">
                {challenge.courseTitle} · {challenge.topicTitles.join('، ')}
              </span>
            </span>
            {challenge.mine ? null : (
              <button type="button" className="ca-btn ca-btn--primary" onClick={() => onAccept(challenge.id)}>
                <Handshake className="size-4" aria-hidden="true" />
                {c.accept}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function errorText(code: ArenaErrorCode): string {
  if (code === 'no_year') return c.blockedYearBody;
  if (code === 'no_subscription') return c.blockedSubBody;
  if (code === 'course_not_playable') return c.courseTooFew;
  if (code === 'topic_required') return c.topicRequired;
  if (code === 'challenge_gone') return c.challengeGone;
  if (code === 'no_questions') return arenaCopy.result.noQuestionsBody;
  return c.closedBody;
}
