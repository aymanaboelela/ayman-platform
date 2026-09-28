'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Circle,
  Diamond,
  Flame,
  Heart,
  RotateCcw,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Triangle,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  GAME_LIVES,
  GAME_ROUND_SIZE,
  GAME_SECONDS_PER_QUESTION,
  GameAnswerResultSchema,
  GameRoundSchema,
  gamePoints,
  type GameRound,
} from '@ayman/contracts/quiz/game';
import { SafeHtml } from '@/components/content/safe-html';
import { apiGet, apiPost } from '@/lib/api';
import { useGameSound } from './use-game-sound';

const c = copy.game;

/** الأشكال والألوان على الاختيارات — كل اختيار ليه شكل ولون، فالعين بتلقطه
 *  قبل ما تقرا، ولون بس مش كفاية لحد عنده عمى ألوان. */
const TILES = [
  { icon: Triangle, tone: 'rose' },
  { icon: Diamond, tone: 'blue' },
  { icon: Circle, tone: 'amber' },
  { icon: Square, tone: 'green' },
] as const;

type Phase = 'intro' | 'countdown' | 'question' | 'feedback' | 'over';

interface Feedback {
  chosen: string | null;
  right: string[];
  correct: boolean;
  gained: number;
}

/**
 * «تحدّي الأسئلة».
 *
 * الحالة كلها هنا في المتصفح: النقط والكومبو والقلوب والتايمر. التصحيح بس في
 * السيرفر، سؤال سؤال (`POST /api/me/game/answer`)، والإجابة الصح مابتوصلش إلا
 * بعد ما الطالب يختار. مفيش لوحة أوائل على اللعبة، فمفيش حاجة تتسرق لو حد لعب
 * في الأرقام — شوف `GAME_POINTS` في الكونتراكت.
 */
export function QuizGame({ initial }: { initial: GameRound }) {
  const [round, setRound] = useState(initial);
  const [phase, setPhase] = useState<Phase>('intro');
  const [count, setCount] = useState(3);
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(GAME_LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  const [left, setLeft] = useState(GAME_SECONDS_PER_QUESTION);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const deadline = useRef(0);
  const sound = useGameSound();

  const question = round.questions[index];
  const total = round.questions.length;

  // العدّ التنازلي قبل أول سؤال. كل الـsetState جوّه الـtimeout، مش في جسم
  // الـeffect نفسه — رندر زيادة مع كل رقم مالوش لازمة.
  useEffect(() => {
    if (phase !== 'countdown') return;
    sound.play('tick');
    const id = window.setTimeout(() => {
      if (count > 1) {
        setCount((n) => n - 1);
        return;
      }
      deadline.current = performance.now() + GAME_SECONDS_PER_QUESTION * 1000;
      setLeft(GAME_SECONDS_PER_QUESTION);
      setPhase('question');
      sound.play('go');
    }, 800);
    return () => window.clearTimeout(id);
  }, [phase, count, sound]);

  const answer = useCallback(
    async (optionId: string | null) => {
      if (!question || busy) return;
      setBusy(true);
      const secondsLeft = Math.max(0, (deadline.current - performance.now()) / 1000);
      try {
        const result = await apiPost('/api/me/game/answer', GameAnswerResultSchema, {
          questionId: question.id,
          optionId,
        });
        const nextStreak = result.correct ? streak + 1 : 0;
        const gained = result.correct ? gamePoints(secondsLeft, nextStreak) : 0;
        setStreak(nextStreak);
        setBestStreak((best) => Math.max(best, nextStreak));
        if (result.correct) {
          setScore((s) => s + gained);
          setRightCount((n) => n + 1);
        } else {
          setLives((n) => n - 1);
        }
        setFeedback({ chosen: optionId, right: result.rightOptionIds, correct: result.correct, gained });
        setPhase('feedback');
        sound.play(result.correct ? (nextStreak >= 3 ? 'combo' : 'right') : 'wrong');
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [question, busy, streak, sound],
  );

  // التايمر: requestAnimationFrame مش setInterval، عشان الشريط يمشي ناعم
  // ويقف لوحده لو التاب اتخبّى (المتصفح بيوقف الفريمات).
  useEffect(() => {
    if (phase !== 'question') return;
    let frame = 0;
    let lastWhole = GAME_SECONDS_PER_QUESTION;
    const step = () => {
      const remaining = Math.max(0, (deadline.current - performance.now()) / 1000);
      setLeft(remaining);
      const whole = Math.ceil(remaining);
      if (whole !== lastWhole && whole <= 5 && whole > 0) sound.play('tick');
      lastWhole = whole;
      if (remaining <= 0) {
        void answer(null);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [phase, answer, sound]);

  const next = useCallback(() => {
    setFeedback(null);
    if (lives <= 0 || index + 1 >= total) {
      setPhase('over');
      sound.play('end');
      return;
    }
    setIndex((i) => i + 1);
    deadline.current = performance.now() + GAME_SECONDS_PER_QUESTION * 1000;
    setLeft(GAME_SECONDS_PER_QUESTION);
    setPhase('question');
  }, [lives, index, total, sound]);

  // بعد الإجابة: ثانية ونص ويروح للي بعده لوحده، والزرار موجود لو حد مستعجل.
  useEffect(() => {
    if (phase !== 'feedback') return;
    const id = window.setTimeout(next, feedback?.correct ? 1400 : 2200);
    return () => window.clearTimeout(id);
  }, [phase, feedback, next]);

  const start = () => {
    sound.unlock();
    setIndex(0);
    setLives(GAME_LIVES);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setRightCount(0);
    setFeedback(null);
    setError(false);
    setCount(3);
    setPhase('countdown');
  };

  const again = async () => {
    setBusy(true);
    try {
      setRound(await apiGet('/api/me/game/round', GameRoundSchema));
      start();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (round.poolSize === 0) {
    return (
      <section className="gm-stage gm-stage--intro">
        <Backdrop />
        <div className="gm-panel gm-panel--center">
          <span className="gm-badge-icon" aria-hidden="true">
            <Sparkles className="size-7" />
          </span>
          <h2 className="gm-title">{c.emptyTitle}</h2>
          <p className="gm-lead">{c.emptyBody}</p>
          <Link href="/path" className="gm-btn gm-btn--primary">
            {c.emptyCta}
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="gm-stage" data-phase={phase}>
      <Backdrop />

      {phase === 'intro' ? (
        <div className="gm-panel gm-panel--center">
          <span className="gm-badge-icon" aria-hidden="true">
            <Zap className="size-8" />
          </span>
          <h2 className="gm-title">{c.title}</h2>
          <p className="gm-lead">{c.lead}</p>
          <p className="gm-pool">{formatCopy(c.poolReady, { n: round.poolSize })}</p>
          <ul className="gm-rules">
            <li>
              <Sparkles className="size-4" aria-hidden="true" />
              {formatCopy(c.ruleQuestions, { n: Math.min(GAME_ROUND_SIZE, total) })}
            </li>
            <li>
              <Timer className="size-4" aria-hidden="true" />
              {formatCopy(c.ruleSeconds, { n: GAME_SECONDS_PER_QUESTION })}
            </li>
            <li>
              <Heart className="size-4" aria-hidden="true" />
              {formatCopy(c.ruleLives, { n: GAME_LIVES })}
            </li>
            <li>
              <Flame className="size-4" aria-hidden="true" />
              {c.ruleCombo}
            </li>
          </ul>
          <button type="button" className="gm-btn gm-btn--primary gm-btn--big" onClick={start}>
            {c.start}
            <Zap className="size-5" aria-hidden="true" />
          </button>
          <SoundToggle sound={sound} />
        </div>
      ) : null}

      {phase === 'countdown' ? (
        <div className="gm-countdown" aria-live="assertive">
          <span key={count} className="gm-countdown__n">
            {count}
          </span>
          <span className="gm-countdown__label">{c.get}</span>
        </div>
      ) : null}

      {(phase === 'question' || phase === 'feedback') && question ? (
        <div className="gm-play">
          <header className="gm-hud">
            <div className="gm-hud__lives" aria-label={formatCopy(c.ruleLives, { n: lives })}>
              {Array.from({ length: GAME_LIVES }, (_, i) => (
                <Heart key={i} className="gm-heart" data-lost={i >= lives || undefined} aria-hidden="true" />
              ))}
            </div>
            <p className="gm-hud__progress">{formatCopy(c.questionOf, { n: index + 1, total })}</p>
            <p className="gm-hud__score">
              <Trophy className="size-4" aria-hidden="true" />
              <span key={score} className="gm-hud__score-n">
                {score.toLocaleString('en-US')}
              </span>
            </p>
          </header>

          <div className="gm-timer" aria-hidden="true">
            <span
              style={{ '--gm-left': `${(left / GAME_SECONDS_PER_QUESTION) * 100}%` } as CSSProperties}
              data-low={left <= 5 || undefined}
            />
          </div>

          {streak >= 2 ? (
            <p key={streak} className="gm-combo">
              <Flame className="size-4" aria-hidden="true" />
              {formatCopy(c.combo, { n: Math.min(3, 1 + (streak - 1) * 0.5) })}
            </p>
          ) : null}

          <div className="gm-question" key={question.id}>
            <SafeHtml html={question.stemHtml} className="gm-question__stem" />
          </div>

          <ul className="gm-options" data-count={question.options.length}>
            {question.options.map((option, i) => {
              const tile = TILES[i % TILES.length]!;
              const Icon = tile.icon;
              const state = !feedback
                ? undefined
                : feedback.right.includes(option.id)
                  ? 'right'
                  : feedback.chosen === option.id
                    ? 'wrong'
                    : 'dim';
              return (
                <li key={option.id} style={{ '--i': i } as CSSProperties}>
                  <button
                    type="button"
                    className="gm-option"
                    data-tone={tile.tone}
                    data-state={state}
                    disabled={phase !== 'question' || busy}
                    onClick={() => void answer(option.id)}
                  >
                    <span className="gm-option__shape" aria-hidden="true">
                      <Icon className="size-5" />
                    </span>
                    <SafeHtml html={option.bodyHtml} className="gm-option__body" />
                  </button>
                </li>
              );
            })}
          </ul>

          {feedback ? (
            <div className="gm-feedback" data-correct={feedback.correct || undefined} role="status">
              <p className="gm-feedback__title">
                {feedback.correct ? c.correct : feedback.chosen === null ? c.timeUp : c.wrong}
              </p>
              {feedback.correct ? <p className="gm-feedback__gain">+{feedback.gained}</p> : null}
              <button type="button" className="gm-btn gm-btn--ghost" onClick={next}>
                {c.next}
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'over' ? (
        <Results
          score={score}
          right={rightCount}
          total={Math.min(total, index + 1)}
          bestStreak={bestStreak}
          outOfLives={lives <= 0}
          busy={busy}
          onAgain={() => void again()}
        />
      ) : null}

      {error ? <p className="gm-error" role="alert">{c.failed}</p> : null}
    </section>
  );
}

function Results({
  score,
  right,
  total,
  bestStreak,
  outOfLives,
  busy,
  onAgain,
}: {
  score: number;
  right: number;
  total: number;
  bestStreak: number;
  outOfLives: boolean;
  busy: boolean;
  onAgain: () => void;
}) {
  const ratio = total > 0 ? right / total : 0;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
  return (
    <div className="gm-panel gm-panel--center gm-results">
      {stars === 3 ? (
        <div className="gm-confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      ) : null}
      <p className="gm-eyebrow">{outOfLives ? c.overLives : c.overTitle}</p>
      <div className="gm-stars" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <Sparkles key={n} className="gm-star" data-on={n <= stars || undefined} style={{ '--i': n } as CSSProperties} />
        ))}
      </div>
      <p className="gm-results__label">{c.overScore}</p>
      <p className="gm-results__score">{score.toLocaleString('en-US')}</p>
      <div className="gm-results__chips">
        <span className="gm-chip">{formatCopy(c.overCorrect, { n: right, total })}</span>
        {bestStreak >= 2 ? (
          <span className="gm-chip">
            <Flame className="size-3.5" aria-hidden="true" />
            {formatCopy(c.overBestCombo, { n: Math.min(3, 1 + (bestStreak - 1) * 0.5) })}
          </span>
        ) : null}
      </div>
      <p className="gm-lead">{stars === 3 ? c.overGreat : stars === 2 ? c.overGood : c.overTry}</p>
      <div className="gm-results__actions">
        <button type="button" className="gm-btn gm-btn--primary gm-btn--big" onClick={onAgain} disabled={busy}>
          <RotateCcw className="size-5" aria-hidden="true" />
          {c.again}
        </button>
        <Link href="/path" className="gm-btn gm-btn--ghost">
          {c.toPath}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function SoundToggle({ sound }: { sound: ReturnType<typeof useGameSound> }) {
  return (
    <button type="button" className="gm-sound" onClick={sound.toggle} aria-pressed={sound.enabled}>
      {sound.enabled ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
      {sound.enabled ? c.soundOn : c.soundOff}
    </button>
  );
}

/** الخلفية: نجوم ودواير نيون بتتحرك ببطء — «المود». زينة بس. */
function Backdrop() {
  return (
    <div className="gm-backdrop" aria-hidden="true">
      <span className="gm-orb gm-orb--1" />
      <span className="gm-orb gm-orb--2" />
      <span className="gm-orb gm-orb--3" />
      <span className="gm-grid" />
      {Array.from({ length: 16 }, (_, i) => (
        <i
          key={i}
          className="gm-star-dot"
          // مكان ثابت لكل نجمة (مش Math.random) عشان السيرفر والمتصفح يرندروا نفس الحاجة.
          style={{ '--i': i, insetBlockStart: `${(i * 37) % 70}%`, insetInlineStart: `${((i * 61) % 96) + 2}%` } as CSSProperties}
        />
      ))}
    </div>
  );
}
