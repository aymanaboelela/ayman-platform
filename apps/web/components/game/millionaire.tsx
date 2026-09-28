'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Crown, LogOut, Mic, MicOff, RotateCcw, Shield, Users, Volume2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  GAME_RULES,
  GameAnswerResultSchema,
  GameLifelineResultSchema,
  MILLIONAIRE_LADDER,
  MILLIONAIRE_SAFE_STEPS,
  type GameLifelineResult,
  type GameRound,
} from '@ayman/contracts/quiz/game';
import { SafeHtml } from '@/components/content/safe-html';
import { apiPost } from '@/lib/api';
import { Backdrop, SoundToggle } from './quiz-game';
import type { GameSound } from './use-game-sound';
import { useSpeech } from './use-speech';

const c = copy.game;
const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const NUM = new Intl.NumberFormat('en-US');

type Phase = 'question' | 'locked' | 'checking' | 'reveal' | 'over';
type Outcome = 'won' | 'walked' | 'lost';

/**
 * «من سيربح المليون».
 *
 * ١٥ سؤال من الأسهل للأصعب (السيرفر بيرتّبهم بنسبة اللي جابوهم صح). كل سؤال:
 * بيتقري بصوت (Web Speech، لو الجهاز عنده صوت عربي)، والطالب يختار، وبعدين
 * «إجابة نهائية؟» — التأكيد ده جزء من اللعبة زي البرنامج، مش احتياط.
 *
 * السلّم نقط مش فلوس، والسؤال الـ٥ والـ١٠ «أمان»: اللي بيقع بعدهم بياخدهم.
 * مساعدتين، كل واحدة مرة في الجولة: «حذف إجابتين» و«اسأل الجمهور» — الاتنين
 * من السيرفر، والجمهور بيقرا اختيارات الطلبة الحقيقية لو فيه كفاية منها.
 */
export function Millionaire({
  round: initial,
  refetch,
  onExit,
  sound,
  voice,
}: {
  round: GameRound;
  /** الستاك عليه صوت حقيقي (Azure)؟ — من `GameHub.voice`. */
  voice: boolean;
  refetch: () => Promise<GameRound>;
  onExit: () => void;
  sound: GameSound;
}) {
  const [round, setRound] = useState(initial);
  const seconds = GAME_RULES.millionaire.seconds[round.level];
  const size = round.questions.length;
  const ladder = useMemo(() => MILLIONAIRE_LADDER.slice(0, size), [size]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [chosen, setChosen] = useState<string | null>(null);
  const [right, setRight] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [votes, setVotes] = useState<GameLifelineResult['votes']>([]);
  const [used, setUsed] = useState({ fifty: false, audience: false });
  const [outcome, setOutcome] = useState<{ kind: Outcome; points: number } | null>(null);
  const [walking, setWalking] = useState(false);
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  // صفر = لسه مابدأش؛ أول فريم في التايمر بيحط الموعد.
  const deadline = useRef(0);
  // الموسيقى بتوطى تحت القراية وبترجع بعدها — `show` نفسه بيتجاهل لو الصوت مقفول.
  const duck = useCallback((on: boolean) => sound.show((score) => score.duck(on)), [sound]);
  const speech = useSpeech(duck);

  const question = round.questions[index];
  const secured = index === 0 ? 0 : ladder[index - 1]!;
  const safeFloor = floorAt(ladder, index);

  // كل سؤال جديد: «دخلة» السؤال (هوا طالع وضربة)، وبعدها القراية فوق فرشة
  // التوتر. القراية بتستنى الدخلة تخلص عشان الصوت مايتغطّاش.
  useEffect(() => {
    if (!question || phase !== 'question') return;
    sound.show((score) => {
      score.setUrgent(false);
      score.intro();
    });
    const timer = window.setTimeout(() => {
      sound.show((score) => score.startBed(size > 1 ? index / (size - 1) : 0));
      speech.read({ questionId: question.id, stemHtml: question.stemHtml, options: question.options, n: index + 1, server: voice });
    }, 1000);
    return () => window.clearTimeout(timer);
    // القراية مرة واحدة لكل سؤال — مش مع كل تغيير في الحالة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  // الموبايل: السلّم شريط أفقي، والسؤال الحالي لازم يفضل في النص منه.
  // `scrollLeft` بس — `scrollIntoView` كان هيحرّك الصفحة كلها لفوق.
  const ladderRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const strip = ladderRef.current;
    const rung = strip?.querySelector<HTMLElement>('[data-now]');
    if (!strip || !rung || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: rung.offsetLeft - (strip.clientWidth - rung.offsetWidth) / 2, behavior: 'smooth' });
  }, [index]);

  // آخر ١٠ ثواني: التكّة بتتضاعف.
  const urgent = phase === 'question' && left <= 10;
  useEffect(() => {
    sound.show((score) => score.setUrgent(urgent));
  }, [urgent, sound]);

  // «الصوت» اتفتح تاني في نص سؤال: الموسيقى ترجع من مكانها في اللعبة.
  // (القفل نفسه بيسكّتها في `toggle`.) أول رندر مش «اتفتح» — الدخلة فوق بتبدأها.
  const wasEnabled = useRef(sound.enabled);
  useEffect(() => {
    if (sound.enabled && !wasEnabled.current) {
      if (phase === 'question') sound.show((score) => score.startBed(size > 1 ? index / (size - 1) : 0));
      else if (phase === 'locked' || phase === 'checking') sound.show((score) => score.startTension());
    }
    wasEnabled.current = sound.enabled;
    // بيتفرج على الزرار بس، مش على كل تغيير في الحالة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound.enabled]);

  // الموسيقى بتسكت لما الطالب يمشي من الصفحة (الراوتر بيسيب الكومبوننت).
  useEffect(() => () => sound.show((score) => score.stopAll(0.1)), [sound]);

  const finish = useCallback(
    (kind: Outcome, points: number) => {
      speech.stop();
      setOutcome({ kind, points });
      setPhase('over');
      // الخسارة اتسمعت خلاص وقت الكشف؛ هنا بس الفوز والانسحاب.
      if (kind !== 'lost') sound.show((score) => score.finale(kind === 'won'));
    },
    [speech, sound],
  );

  const check = useCallback(
    async (optionId: string | null) => {
      if (!question) return;
      setBusy(true);
      setPhase('checking');
      speech.stop();
      try {
        const [result] = await Promise.all([
          apiPost('/api/me/game/answer', GameAnswerResultSchema, { questionId: question.id, optionId }),
          // لحظة سكوت قبل الكشف — «التشويق» نص اللعبة.
          new Promise((resolve) => window.setTimeout(resolve, 1400)),
        ]);
        setRight(result.rightOptionIds);
        setPhase('reveal');
        const milestone = (MILLIONAIRE_SAFE_STEPS as readonly number[]).includes(index + 1) || index + 1 >= size;
        sound.show((score) => (result.correct ? score.right(milestone) : score.wrong()));
        window.setTimeout(() => {
          if (!result.correct) {
            finish('lost', safeFloor);
          } else if (index + 1 >= size) {
            finish('won', ladder[index]!);
          } else {
            setIndex((i) => i + 1);
            setChosen(null);
            setRight([]);
            setRemoved([]);
            setVotes([]);
            deadline.current = performance.now() + seconds * 1000;
            setLeft(seconds);
            setPhase('question');
          }
        }, result.correct ? 1800 : 2600);
      } catch {
        // السؤال رجع مفتوح — والفرشة ترجع معاه بدل التوتر.
        sound.show((score) => score.startBed(size > 1 ? index / (size - 1) : 0));
        setPhase('question');
      } finally {
        setBusy(false);
      }
    },
    [question, speech, sound, index, size, ladder, safeFloor, finish, seconds],
  );

  // التايمر بيقف وقت «إجابة نهائية؟» — التفكير في التأكيد مش بيتحسب.
  useEffect(() => {
    if (phase !== 'question') return;
    let frame = 0;
    if (deadline.current === 0) deadline.current = performance.now() + seconds * 1000;
    const step = () => {
      const remaining = Math.max(0, (deadline.current - performance.now()) / 1000);
      setLeft(remaining);
      if (remaining <= 0) {
        void check(null);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [phase, check, seconds]);

  const lock = (optionId: string) => {
    if (phase !== 'question' && phase !== 'locked') return;
    // التايمر بيقف هنا (الـeffect بتاعه مربوط بـ`question`)، و`left` بيفضل
    // شايل اللي فاضل عشان «لأ، لسه» يكمّل منه.
    setChosen(optionId);
    setPhase('locked');
    // الاختيار بيتبدّل وهو مقفول (دوسة على اختيار تاني) — التوتر مابيبدأش من الأول.
    if (phase === 'question') {
      sound.show((score) => {
        score.lock();
        score.startTension();
      });
    } else {
      sound.play('tick');
    }
  };

  const cancelLock = () => {
    deadline.current = performance.now() + left * 1000;
    setChosen(null);
    setPhase('question');
    sound.show((score) => score.startBed(size > 1 ? index / (size - 1) : 0));
  };

  const lifeline = async (kind: 'fifty' | 'audience') => {
    if (!question || used[kind] || busy) return;
    setBusy(true);
    try {
      const result = await apiPost('/api/me/game/lifeline', GameLifelineResultSchema, { questionId: question.id, kind });
      setUsed((u) => ({ ...u, [kind]: true }));
      if (kind === 'fifty') setRemoved(result.removeOptionIds);
      else setVotes(result.votes);
      sound.show((score) => score.lifeline());
    } finally {
      setBusy(false);
    }
  };

  const again = async () => {
    setBusy(true);
    try {
      const next = await refetch();
      setRound(next);
      setIndex(0);
      setChosen(null);
      setRight([]);
      setRemoved([]);
      setVotes([]);
      setUsed({ fifty: false, audience: false });
      setOutcome(null);
      deadline.current = performance.now() + seconds * 1000;
      setLeft(seconds);
      setPhase('question');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'over' && outcome) {
    return (
      <section className="gm-stage mln">
        <Backdrop />
        <div className="gm-panel gm-panel--center mln-result">
          {outcome.kind === 'won' ? (
            <div className="gm-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
          ) : null}
          <span className="mln-medal" data-kind={outcome.kind} aria-hidden="true">
            <Crown className="size-10" />
          </span>
          <p className="gm-eyebrow">
            {outcome.kind === 'won'
              ? c.mlnWon
              : outcome.kind === 'walked'
                ? formatCopy(c.mlnLeft, { points: NUM.format(outcome.points) })
                : formatCopy(c.mlnLost, { points: NUM.format(outcome.points) })}
          </p>
          <p className="gm-results__score">{NUM.format(outcome.points)}</p>
          <p className="gm-lead">
            {outcome.kind === 'won'
              ? c.mlnWonBody
              : formatCopy(c.mlnReached, { n: outcome.kind === 'lost' ? index + 1 : index })}
            {outcome.kind === 'lost' && outcome.points > 0 ? ` ${c.mlnLostSafe}` : ''}
          </p>
          <div className="gm-results__actions">
            <button type="button" className="gm-btn gm-btn--primary gm-btn--big" onClick={() => void again()} disabled={busy}>
              <RotateCcw className="size-5" aria-hidden="true" />
              {c.again}
            </button>
            <button type="button" className="gm-btn gm-btn--ghost" onClick={onExit}>
              {c.toGames}
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!question) return null;
  const voteOf = (optionId: string) => votes.find((vote) => vote.optionId === optionId)?.percent;

  return (
    <section
      className="gm-stage mln"
      data-phase={phase}
      data-verdict={phase === 'reveal' ? (chosen !== null && right.includes(chosen) ? 'right' : 'wrong') : undefined}
    >
      <Backdrop />
      {/* كشافات المسرح: بتتمايل على السؤال، وبتقلب دهبي وقت «إجابة نهائية»،
          وأخضر أو أحمر وقت الكشف — زي أرضية البرنامج. */}
      <div className="mln-lights" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="mln-floor" aria-hidden="true" />
      <div className="mln-intro" key={`intro-${question.id}`} aria-hidden="true">
        <span>{formatCopy(c.mlnQuestion, { n: index + 1 })}</span>
        <strong>{NUM.format(ladder[index]!)}</strong>
      </div>
      <div className="mln-layout">
        <div className="mln-main">
          <header className="mln-top">
            <div className="mln-lifelines">
              <button
                type="button"
                className="mln-life"
                data-used={used.fifty || undefined}
                disabled={used.fifty || phase !== 'question' || busy}
                onClick={() => void lifeline('fifty')}
                aria-label={c.mlnFifty}
                title={c.mlnFifty}
              >
                <span className="mln-life__fifty">50:50</span>
              </button>
              <button
                type="button"
                className="mln-life"
                data-used={used.audience || undefined}
                disabled={used.audience || phase !== 'question' || busy}
                onClick={() => void lifeline('audience')}
                aria-label={c.mlnAudience}
                title={c.mlnAudience}
              >
                <Users className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mln-life"
                onClick={() =>
                  speech.read({ questionId: question.id, stemHtml: question.stemHtml, options: question.options, n: index + 1, server: voice })
                }
                aria-label={c.mlnRead}
                title={c.mlnRead}
                disabled={!speech.supported}
              >
                <Volume2 className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mln-timer" aria-hidden="true" style={{ '--p': left / seconds } as CSSProperties} data-low={left <= 8 || undefined}>
              <span>{Math.ceil(left)}</span>
            </div>
          </header>

          <p className="mln-for">
            {formatCopy(c.mlnQuestion, { n: index + 1 })} · {formatCopy(c.mlnFor, { points: NUM.format(ladder[index]!) })}
          </p>

          <div className="mln-question" key={question.id}>
            <SafeHtml html={question.stemHtml} className="mln-question__stem" />
          </div>

          {votes.length > 0 ? (
            <div className="mln-audience" aria-label={c.mlnAudienceTitle}>
              <p className="mln-audience__title">
                <Users className="size-4" aria-hidden="true" />
                {c.mlnAudienceTitle}
              </p>
              <div className="mln-audience__bars">
                {question.options.map((option, i) => (
                  <div key={option.id} className="mln-audience__bar">
                    <span className="mln-audience__fill" style={{ '--v': `${voteOf(option.id) ?? 0}%` } as CSSProperties} />
                    <span className="mln-audience__pct">{voteOf(option.id) ?? 0}%</span>
                    <span className="mln-audience__letter">{LETTERS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <ul className="mln-options">
            {question.options.map((option, i) => {
              const gone = removed.includes(option.id);
              const state =
                phase === 'reveal'
                  ? right.includes(option.id)
                    ? 'right'
                    : chosen === option.id
                      ? 'wrong'
                      : undefined
                  : chosen === option.id
                    ? 'locked'
                    : undefined;
              return (
                <li key={option.id} style={{ '--i': i } as CSSProperties}>
                  <button
                    type="button"
                    className="mln-option"
                    data-state={state}
                    data-gone={gone || undefined}
                    disabled={gone || (phase !== 'question' && phase !== 'locked')}
                    onClick={() => lock(option.id)}
                  >
                    <span className="mln-option__letter">{LETTERS[i]}:</span>
                    {gone ? null : <SafeHtml html={option.bodyHtml} className="mln-option__body" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {phase === 'locked' && chosen ? (
            <div className="mln-final" role="dialog" aria-label={c.mlnFinal}>
              <p className="mln-final__q">{c.mlnFinal}</p>
              <div className="mln-final__actions">
                <button type="button" className="gm-btn gm-btn--primary" onClick={() => void check(chosen)}>
                  <Check className="size-4" aria-hidden="true" />
                  {c.mlnConfirm}
                </button>
                <button type="button" className="gm-btn gm-btn--ghost" onClick={cancelLock}>
                  {c.mlnCancel}
                </button>
              </div>
            </div>
          ) : null}

          {phase === 'reveal' ? (
            <p className="mln-verdict" data-right={right.includes(chosen ?? '') || undefined} role="status">
              {chosen === null
                ? c.mlnTimeUp
                : !right.includes(chosen)
                  ? c.mlnWrong
                  : (MILLIONAIRE_SAFE_STEPS as readonly number[]).includes(index + 1) && index + 1 < size
                    ? formatCopy(c.mlnSafeReached, { points: NUM.format(ladder[index]!) })
                    : c.mlnRight}
            </p>
          ) : null}

          <footer className="mln-bottom">
            {walking ? (
              <div className="mln-walk">
                <span>{formatCopy(c.mlnWalkConfirm, { points: NUM.format(secured) })}</span>
                <button type="button" className="gm-btn gm-btn--primary" onClick={() => finish('walked', secured)}>
                  {c.mlnConfirm}
                </button>
                <button type="button" className="gm-btn gm-btn--ghost" onClick={() => setWalking(false)}>
                  {c.mlnCancel}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mln-walk-btn"
                onClick={() => setWalking(true)}
                disabled={phase !== 'question' || index === 0}
              >
                <LogOut className="size-4" aria-hidden="true" />
                {c.mlnWalk}
              </button>
            )}
            {speech.stuck ? (
              <p className="mln-stuck" role="status">
                {c.mlnSpeechStuck}
              </p>
            ) : null}
            <div className="mln-toggles">
              <button type="button" className="gm-sound" onClick={speech.toggle} aria-pressed={speech.enabled} disabled={!speech.supported}>
                {speech.enabled ? <Mic className="size-4" aria-hidden="true" /> : <MicOff className="size-4" aria-hidden="true" />}
                {speech.enabled ? c.mlnVoiceOn : c.mlnVoiceOff}
              </button>
              <SoundToggle sound={sound} />
            </div>
          </footer>
        </div>

        <ol className="mln-ladder" aria-label="السلّم" ref={ladderRef}>
          {ladder
            .map((points, i) => ({ points, step: i + 1 }))
            .reverse()
            .map(({ points, step }) => (
              <li
                key={step}
                className="mln-rung"
                data-now={step === index + 1 || undefined}
                data-done={step <= index || undefined}
                data-safe={(MILLIONAIRE_SAFE_STEPS as readonly number[]).includes(step) || undefined}
              >
                <span className="mln-rung__step">{step}</span>
                <span className="mln-rung__points">{NUM.format(points)}</span>
                {(MILLIONAIRE_SAFE_STEPS as readonly number[]).includes(step) ? (
                  <Shield className="mln-rung__safe" aria-label={c.mlnSafe} />
                ) : null}
              </li>
            ))}
        </ol>
      </div>
    </section>
  );
}

/** النقط المضمونة لو الجولة وقعت على السؤال ده: آخر «أمان» اتعدّى. */
function floorAt(ladder: readonly number[], index: number): number {
  let floor = 0;
  for (const step of MILLIONAIRE_SAFE_STEPS) if (index >= step) floor = ladder[step - 1] ?? floor;
  return floor;
}
