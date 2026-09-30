'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Flag, Frown, Handshake, Hourglass, Radar, RotateCcw, Swords, Trophy, WifiOff, X, Zap } from 'lucide-react';
import { ARENA_RULES, type ArenaMatchView } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { SafeHtml } from '@/components/content/safe-html';
import { ArenaEmblem, Confetti, CountdownRing, Fighter, Num, SoundButton, useNow } from './arena-bits';
import { clockText, isLatinText, patienceRanOut, remainingMs, type ArenaState } from './arena-state';
import type { ArenaSound } from './use-arena-sound';

const c = arenaCopy;
const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

// ── بندوّر ──────────────────────────────────────────────────────────────

export function ArenaSearch({
  state,
  me,
  courseTitle,
  cohortLabel,
  onCancel,
  onKeepWaiting,
  sound,
}: {
  state: ArenaState;
  me: { name: string; image: string | null };
  courseTitle: string;
  cohortLabel: string;
  onCancel: () => void;
  onKeepWaiting: () => void;
  sound: ArenaSound;
}) {
  const now = useNow(500);
  const queued = state.view.phase === 'queued' ? state.view : null;
  const elapsed = queued ? now + state.offset - queued.since : 0;
  const nobody = patienceRanOut(state.patienceFrom, now, ARENA_RULES.searchPatienceMs);

  // «بليب» الرادار كل ٣ ثواني وهو بيدوّر — واطي، ومع زرار الصوت.
  const { play } = sound;
  useEffect(() => {
    if (nobody) return;
    const timer = setInterval(() => play('blip'), 3_000);
    return () => clearInterval(timer);
  }, [play, nobody]);

  return (
    <section className="ca-stage ca-search">
      <div className="ca-stage__bar">
        <span className="ca-badge">
          <Swords className="size-4" aria-hidden="true" />
          {c.meta.title}
        </span>
        <SoundButton sound={sound} />
      </div>

      <div className="ca-radar" aria-hidden="true">
        <span className="ca-radar__ring" />
        <span className="ca-radar__ring" />
        <span className="ca-radar__ring" />
        <span className="ca-radar__sweep" />
        <span className="ca-radar__blip" style={{ '--a': '40deg', '--r': '5.2rem' } as CSSProperties} />
        <span className="ca-radar__blip" style={{ '--a': '160deg', '--r': '3.6rem' } as CSSProperties} />
        <span className="ca-radar__blip" style={{ '--a': '270deg', '--r': '6.4rem' } as CSSProperties} />
        <span className="ca-radar__me">
          <Fighter player={me} side="you" size={72} />
        </span>
      </div>

      <h2 className="ca-stage__title" aria-live="polite">
        <Radar className="size-6" aria-hidden="true" />
        {state.connection === 'lost' ? c.search.reconnecting : c.search.title}
      </h2>
      <p className="ca-stage__sub">{formatCopy(c.search.sub, { cohort: cohortLabel, course: courseTitle })}</p>
      <p className="ca-elapsed">
        <Hourglass className="size-4" aria-hidden="true" />
        {formatCopy(c.search.elapsed, { time: '' })}
        <Num value={clockText(elapsed)} className="ca-elapsed__clock" />
      </p>

      {nobody ? (
        <div className="ca-nobody" role="status">
          <h3 className="ca-nobody__title">{c.search.nobodyTitle}</h3>
          <p className="ca-nobody__body">{c.search.nobodyBody}</p>
          <div className="ca-actions">
            <button type="button" className="ca-btn ca-btn--primary" onClick={onKeepWaiting}>
              {c.search.keepWaiting}
            </button>
            <button type="button" className="ca-btn ca-btn--ghost" onClick={onCancel}>
              {c.search.leave}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ca-btn ca-btn--ghost" onClick={onCancel}>
          <X className="size-4" aria-hidden="true" />
          {c.search.cancel}
        </button>
      )}
    </section>
  );
}

// ── VS ───────────────────────────────────────────────────────────────────

export function ArenaVersus({ match, offset, sound }: { match: ArenaMatchView; offset: number; sound: ArenaSound }) {
  const now = useNow(200);
  const left = Math.ceil(remainingMs(match.deadline, offset, now) / 1000);
  return (
    <section className="ca-stage ca-vs">
      <div className="ca-stage__bar">
        <span className="ca-badge">
          <Zap className="size-4" aria-hidden="true" />
          {c.versus.found}
        </span>
        <SoundButton sound={sound} />
      </div>
      <div className="ca-vs__arena">
        <div className="ca-vs__side" data-side="you">
          <Fighter player={match.you.player} side="you" size={96} />
          <span className="ca-vs__name">{match.you.player.name}</span>
          <span className="ca-vs__tag">{c.play.me}</span>
        </div>
        <div className="ca-vs__mid" aria-hidden="true">
          <span className="ca-vs__burst" />
          <span className="ca-vs__text">{c.versus.vs}</span>
        </div>
        <div className="ca-vs__side" data-side="opponent">
          <Fighter player={match.opponent.player} side="opponent" size={96} />
          <span className="ca-vs__name">{match.opponent.player.name}</span>
        </div>
      </div>
      <p className="ca-stage__sub">
        {match.courseTitle} · {formatCopy(c.versus.questions, { n: match.total })}
      </p>
      <p className="ca-vs__count" aria-label={c.versus.getReady}>
        {left > 0 ? <Num value={left} key={left} className="ca-vs__digit" /> : c.versus.getReady}
      </p>
    </section>
  );
}

// ── السؤال ───────────────────────────────────────────────────────────────

export function ArenaMatch({
  state,
  match,
  onAnswer,
  onLeave,
  sound,
}: {
  state: ArenaState;
  match: ArenaMatchView;
  onAnswer: (optionId: string) => void;
  onLeave: () => void;
  sound: ArenaSound;
}) {
  const now = useNow(100);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const live = match.stage === 'question' && !match.paused;
  const leftMs = live ? remainingMs(match.deadline, state.offset, now) : 0;
  const seconds = Math.ceil(leftMs / 1000);
  const question = match.question;
  const reveal = match.stage === 'reveal' ? match.reveal : null;
  const locked = match.you.status === 'locked' || match.yourPick !== null;

  // تكة في آخر ٣ ثواني.
  const lastTick = useRef<number | null>(null);
  const { play } = sound;
  useEffect(() => {
    if (!live || seconds > 3 || seconds < 1 || lastTick.current === seconds) return;
    lastTick.current = seconds;
    play('tick');
  }, [live, seconds, play]);

  const burst = state.fx && (state.fx.fx === 'you_right' || state.fx.fx === 'opponent_right') ? state.fx : null;
  const feedback = feedbackLine(match, state);

  return (
    <section className="ca-stage ca-match" data-stage={match.stage}>
      <div className="ca-stage__bar">
        <button type="button" className="ca-icon-btn" onClick={() => setConfirmLeave(true)} aria-label={c.play.leave} title={c.play.leave}>
          <Flag className="size-5" aria-hidden="true" />
        </button>
        <span className="ca-match__count">
          {formatCopy(c.play.questionOf, { n: match.index + 1, total: match.total })}
        </span>
        <SoundButton sound={sound} />
      </div>

      <div className="ca-score">
        <Side match={match} who="you" burstKey={burst?.fx === 'you_right' ? burst.key : null} />
        <div className="ca-score__mid">
          <CountdownRing
            fraction={live ? leftMs / match.questionMs : match.stage === 'reveal' ? 0 : 1}
            seconds={live ? seconds : null}
            paused={Boolean(match.paused)}
          />
          <ol className="ca-dots" aria-hidden="true">
            {Array.from({ length: match.total }, (_, i) => (
              <li key={i} data-result={match.history[i] ?? (i === match.index ? 'now' : 'next')} />
            ))}
          </ol>
        </div>
        <Side match={match} who="opponent" burstKey={burst?.fx === 'opponent_right' ? burst.key : null} />
      </div>

      {question ? (
        <div className="ca-question" key={`${match.id}-${question.index}`}>
          <SafeHtml html={question.stemHtml} className="ca-question__stem" />
          <div className="ca-options" data-count={question.options.length}>
            {question.options.map((option, i) => {
              const optionState = optionStateOf(option.id, match, state.pending);
              return (
                <button
                  key={option.id}
                  type="button"
                  className="ca-option"
                  data-tone={i % 4}
                  data-state={optionState}
                  disabled={!live || locked || state.pending !== null}
                  onClick={() => {
                    sound.unlock();
                    onAnswer(option.id);
                  }}
                >
                  <span className="ca-option__letter" aria-hidden="true">
                    {LETTERS[i] ?? i + 1}
                  </span>
                  <span className="ca-option__text" data-dir={isLatinText(option.bodyHtml) ? 'ltr' : undefined}>
                    <SafeHtml html={option.bodyHtml} className="ca-option__body" />
                  </span>
                  {reveal && reveal.opponentOptionId === option.id ? (
                    <span className="ca-option__pick" data-side="opponent">
                      {match.opponent.player.name}
                    </span>
                  ) : null}
                  {optionState === 'right' ? <Check className="ca-option__mark size-5" aria-hidden="true" /> : null}
                  {optionState === 'wrong' ? <X className="ca-option__mark size-5" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <p className="ca-feedback" data-tone={feedback.tone} role="status" aria-live="polite">
        {feedback.text}
      </p>

      {match.paused ? <PauseOverlay match={match} offset={state.offset} now={now} /> : null}
      {state.connection === 'lost' && !match.paused ? (
        // النت قطع عندنا: السيرفر لسه مايعرفش، والشاشة مش هتتحدّث لحد ما الستريم يرجع.
        <p className="ca-lost" role="status">
          <WifiOff className="size-5" aria-hidden="true" />
          <span>{c.play.selfOfflineTitle}</span>
          <span className="ca-lost__sub">{c.play.reconnecting}</span>
        </p>
      ) : null}

      {confirmLeave ? (
        <div className="ca-overlay" role="dialog" aria-modal="true" aria-labelledby="ca-leave-title">
          <div className="ca-overlay__card">
            <Flag className="ca-overlay__icon" aria-hidden="true" />
            <h3 id="ca-leave-title" className="ca-overlay__title">
              {c.play.leaveTitle}
            </h3>
            <p className="ca-overlay__body">{formatCopy(c.play.leaveBody, { name: match.opponent.player.name })}</p>
            <div className="ca-actions">
              <button type="button" className="ca-btn ca-btn--primary" onClick={() => setConfirmLeave(false)} autoFocus>
                {c.play.leaveCancel}
              </button>
              <button
                type="button"
                className="ca-btn ca-btn--danger"
                onClick={() => {
                  setConfirmLeave(false);
                  onLeave();
                }}
              >
                {c.play.leaveConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Side({ match, who, burstKey }: { match: ArenaMatchView; who: 'you' | 'opponent'; burstKey: number | null }) {
  const side = match[who];
  const status =
    side.status === 'offline' ? c.play.offline : side.status === 'locked' ? c.play.locked : who === 'opponent' && match.stage === 'question' ? c.play.thinking : '';
  return (
    <div className="ca-side" data-side={who} data-state={side.status}>
      <Fighter player={side.player} side={who} size={46} state={side.status} />
      <div className="ca-side__text">
        <span className="ca-side__name">{who === 'you' ? c.play.me : side.player.name}</span>
        <span className="ca-side__status">
          {side.status === 'offline' ? <WifiOff className="size-3.5" aria-hidden="true" /> : null}
          {side.status === 'locked' ? <X className="size-3.5" aria-hidden="true" /> : null}
          {status}
          {who === 'opponent' && side.status === 'thinking' && match.stage === 'question' ? (
            <span className="ca-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </span>
      </div>
      <Num value={side.score} key={`${who}-${side.score}`} className="ca-side__score" />
      {burstKey !== null ? (
        <span className="ca-burst" key={burstKey} aria-hidden="true">
          {c.play.point}
        </span>
      ) : null}
    </div>
  );
}

function optionStateOf(optionId: string, match: ArenaMatchView, pending: string | null) {
  const reveal = match.stage === 'reveal' ? match.reveal : null;
  if (reveal) {
    if (reveal.correctOptionIds.includes(optionId)) return 'right';
    if (reveal.yourOptionId === optionId || reveal.opponentOptionId === optionId) return 'wrong';
    return 'dim';
  }
  if (match.yourPick === optionId) return 'wrong';
  if (pending === optionId) return 'pending';
  if (match.yourPick !== null) return 'dim';
  return 'idle';
}

function feedbackLine(match: ArenaMatchView, state: ArenaState): { text: string; tone: string } {
  const name = match.opponent.player.name;
  if (state.late) return { text: c.play.late, tone: 'muted' };
  if (match.stage === 'reveal' && match.reveal) {
    const { winner, reason } = match.reveal;
    if (winner === 'you') return { text: c.play.youRight, tone: 'ok' };
    if (winner === 'opponent') return { text: formatCopy(c.play.opponentRight, { name }), tone: 'err' };
    return { text: reason === 'both_wrong' ? c.play.bothWrong : c.play.timeout, tone: 'muted' };
  }
  if (match.yourPick) return { text: formatCopy(c.play.youWrong, { name }), tone: 'err' };
  if (match.opponent.status === 'locked') return { text: formatCopy(c.play.opponentWrong, { name }), tone: 'gold' };
  return { text: ' ', tone: 'muted' };
}

function PauseOverlay({ match, offset, now }: { match: ArenaMatchView; offset: number; now: number }) {
  const pause = match.paused;
  if (!pause) return null;
  const left = Math.ceil(remainingMs(pause.graceUntil, offset, now) / 1000);
  const name = match.opponent.player.name;
  const title =
    pause.who === 'opponent'
      ? formatCopy(c.play.opponentOfflineTitle, { name })
      : pause.who === 'you'
        ? c.play.selfOfflineTitle
        : c.play.bothOfflineTitle;
  const body =
    pause.who === 'opponent' ? formatCopy(c.play.opponentOfflineBody, { s: left }) : formatCopy(c.play.selfOfflineBody, { s: left });
  return (
    <div className="ca-overlay" data-kind="offline" role="alertdialog" aria-live="assertive" aria-labelledby="ca-offline-title">
      <div className="ca-overlay__card">
        <span className="ca-offline__icon" aria-hidden="true">
          <WifiOff className="size-8" />
        </span>
        <h3 id="ca-offline-title" className="ca-overlay__title">
          {title}
        </h3>
        <CountdownRing fraction={(left * 1000) / ARENA_RULES.graceMs} seconds={Math.max(0, left)} size={84} />
        <p className="ca-overlay__body">{body}</p>
      </div>
    </div>
  );
}

// ── النتيجة ───────────────────────────────────────────────────────────────

export function ArenaResult({
  match,
  onAgain,
  onLobby,
  sound,
}: {
  match: ArenaMatchView;
  onAgain: () => void;
  onLobby: () => void;
  sound: ArenaSound;
}) {
  const end = match.end;
  if (!end) return null;
  const name = match.opponent.player.name;
  const { title, body, icon, tone } = resultCopy(end, name);
  const Icon = icon;
  const win = end.outcome === 'win';

  return (
    <section className="ca-stage ca-result" data-tone={tone} aria-live="polite">
      {win ? <Confetti /> : null}
      <div className="ca-stage__bar">
        <span className="ca-badge">
          <ArenaEmblem className="size-4" />
          {c.meta.title}
        </span>
        <SoundButton sound={sound} />
      </div>
      <span className="ca-result__icon" aria-hidden="true">
        <Icon className="size-10" />
      </span>
      <h2 className="ca-result__title">{title}</h2>
      <p className="ca-stage__sub">{body}</p>

      <div className="ca-result__board">
        <div className="ca-result__side" data-side="you" data-won={end.outcome === 'win' || undefined}>
          <Fighter player={match.you.player} side="you" size={70} />
          <span className="ca-result__name">{c.play.me}</span>
        </div>
        {/* رقمين منفصلين مش سترنج LTR واحد: في RTL «٠ — ١» كانت بتحط رقمك جنب
            صورة المنافس. كده كل رقم جنب صاحبه. */}
        <span className="ca-result__score">
          <Num value={match.you.score} />
          <span aria-hidden="true">—</span>
          <Num value={match.opponent.score} />
        </span>
        <div className="ca-result__side" data-side="opponent" data-won={end.outcome === 'loss' || undefined}>
          <Fighter player={match.opponent.player} side="opponent" size={70} />
          <span className="ca-result__name">{name}</span>
        </div>
      </div>

      <div className="ca-result__points" data-earned={end.pointsEarned > 0 || undefined}>
        <Trophy className="size-5" aria-hidden="true" />
        {end.pointsEarned > 0 ? (
          <Num value={formatCopy(c.result.pointsEarned, { n: end.pointsEarned })} />
        ) : (
          <span>{c.result.pointsNone}</span>
        )}
        {end.totalPoints !== null ? (
          <span className="ca-result__total">{formatCopy(c.result.total, { n: end.totalPoints })}</span>
        ) : null}
      </div>
      {end.capped ? (
        <p className="ca-result__capped">
          {formatCopy(c.result.capped, { cap: ARENA_RULES.dailyPointsCap, pair: ARENA_RULES.pairScoredPerDay })}
        </p>
      ) : null}

      <div className="ca-actions">
        <button
          type="button"
          className="ca-btn ca-btn--primary ca-btn--big"
          onClick={() => {
            sound.unlock();
            onAgain();
          }}
        >
          <RotateCcw className="size-5" aria-hidden="true" />
          {c.result.again}
        </button>
        <button type="button" className="ca-btn ca-btn--ghost" onClick={onLobby}>
          {c.result.backToLobby}
        </button>
      </div>
    </section>
  );
}

function resultCopy(end: NonNullable<ArenaMatchView['end']>, name: string) {
  if (end.reason === 'aborted') return { title: c.result.aborted, body: c.result.abortedBody, icon: WifiOff, tone: 'muted' };
  if (end.reason === 'abandoned') return { title: c.result.abandoned, body: c.result.abandonedBody, icon: WifiOff, tone: 'muted' };
  if (end.reason === 'forfeit') {
    return end.outcome === 'win'
      ? { title: c.result.forfeitWin, body: formatCopy(c.result.forfeitWinBody, { name }), icon: Trophy, tone: 'win' }
      : {
          title: c.result.forfeitLoss,
          body: formatCopy(c.result.forfeitLossBody, { name, s: ARENA_RULES.graceMs / 1000 }),
          icon: Flag,
          tone: 'loss',
        };
  }
  if (end.outcome === 'win') return { title: c.result.win, body: c.result.winBody, icon: Trophy, tone: 'win' };
  if (end.outcome === 'loss') return { title: c.result.loss, body: formatCopy(c.result.lossBody, { name }), icon: Frown, tone: 'loss' };
  return { title: c.result.draw, body: c.result.drawBody, icon: Handshake, tone: 'draw' };
}

/** «مفيش أسئلة كفاية» و«اتقطع» قبل ما يبقى فيه ماتش — نفس كارت النتيجة. */
export function ArenaNotice({
  title,
  body,
  onLobby,
}: {
  title: string;
  body: string;
  onLobby: () => void;
}) {
  return (
    <section className="ca-stage ca-result" data-tone="muted">
      <span className="ca-result__icon" aria-hidden="true">
        <WifiOff className="size-10" />
      </span>
      <h2 className="ca-result__title">{title}</h2>
      <p className="ca-stage__sub">{body}</p>
      <button type="button" className="ca-btn ca-btn--primary" onClick={onLobby}>
        {c.result.backToLobby}
      </button>
    </section>
  );
}

