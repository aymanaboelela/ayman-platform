'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Crown, HeartPulse, Sparkles, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  GameRoundSchema,
  type GameHub,
  type GameLevel,
  type GameMode,
  type GameRound,
} from '@ayman/contracts/quiz/game';
import { apiGet } from '@/lib/api';
import { Millionaire } from './millionaire';
import { Backdrop, QuizGame, SoundToggle } from './quiz-game';
import { useGameSound } from './use-game-sound';

const c = copy.game;

const MODES: Array<{ mode: GameMode; title: string; body: string; icon: typeof Crown; tone: string }> = [
  { mode: 'millionaire', title: c.modeMillionaire, body: c.modeMillionaireBody, icon: Crown, tone: 'gold' },
  { mode: 'race', title: c.modeRace, body: c.modeRaceBody, icon: Zap, tone: 'rose' },
  { mode: 'survival', title: c.modeSurvival, body: c.modeSurvivalBody, icon: HeartPulse, tone: 'teal' },
];

const LEVELS: Array<{ level: GameLevel; label: string }> = [
  { level: 'easy', label: c.levelEasy },
  { level: 'medium', label: c.levelMedium },
  { level: 'hard', label: c.levelHard },
];

/**
 * صفحة الألعاب: اختيار اللعبة، والكورس، والمستوى — وبعدين اللعبة نفسها في
 * نفس المكان.
 *
 * الصوت بيتفتح هنا (`sound.unlock()` على «يلا نبدأ»)، لأن دي آخر دوسة قبل
 * اللعبة والمتصفح مابيسمحش بصوت من غير دوسة.
 */
export function GamesHub({ hub }: { hub: GameHub }) {
  const sound = useGameSound();
  const [mode, setMode] = useState<GameMode>('millionaire');
  const [courseId, setCourseId] = useState<string | null>(hub.courses.length === 1 ? hub.courses[0]!.id : null);
  const [level, setLevel] = useState<GameLevel>('medium');
  const [round, setRound] = useState<GameRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const counts = courseId
    ? (hub.courses.find((course) => course.id === courseId)?.counts ?? { easy: 0, medium: 0, hard: 0 })
    : hub.courses.reduce(
        (sum, course) => ({
          easy: sum.easy + course.counts.easy,
          medium: sum.medium + course.counts.medium,
          hard: sum.hard + course.counts.hard,
        }),
        { easy: 0, medium: 0, hard: 0 },
      );
  const available = counts.easy + counts.medium + counts.hard;

  const fetchRound = () => {
    const params = new URLSearchParams({ mode, level });
    if (courseId) params.set('courseId', courseId);
    return apiGet(`/api/me/game/round?${params.toString()}`, GameRoundSchema);
  };

  const start = async () => {
    sound.unlock();
    setBusy(true);
    setError(false);
    try {
      setRound(await fetchRound());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (hub.total === 0) {
    return (
      <section className="gm-stage">
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

  if (round && round.questions.length > 0) {
    const exit = () => setRound(null);
    return round.mode === 'millionaire' ? (
      <Millionaire key={round.questions[0]!.id} round={round} refetch={fetchRound} onExit={exit} sound={sound} />
    ) : (
      <QuizGame key={round.questions[0]!.id} round={round} refetch={fetchRound} onExit={exit} sound={sound} />
    );
  }

  return (
    <section className="gm-stage gm-stage--hub">
      <Backdrop />
      <div className="gm-hub">
        {/* العنوان «الألعاب» هو الـh1 بتاع الصفحة فوق — هنا الشرح بس. */}
        <header className="gm-hub__head">
          <p className="gm-lead">{c.hubLead}</p>
        </header>

        <fieldset className="gm-hub__group">
          <legend className="gm-hub__legend">{c.pickGame}</legend>
          <div className="gm-modes">
            {MODES.map((entry) => (
              <label key={entry.mode} className="gm-mode" data-tone={entry.tone} data-on={mode === entry.mode || undefined}>
                <input
                  type="radio"
                  name="mode"
                  className="sr-only"
                  checked={mode === entry.mode}
                  onChange={() => setMode(entry.mode)}
                />
                <span className="gm-mode__icon" aria-hidden="true">
                  <entry.icon className="size-7" />
                </span>
                <span className="gm-mode__title">{entry.title}</span>
                <span className="gm-mode__body">{entry.body}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {hub.courses.length > 1 ? (
          <fieldset className="gm-hub__group">
            <legend className="gm-hub__legend">{c.pickCourse}</legend>
            <div className="gm-chips">
              <label className="gm-pick" data-on={courseId === null || undefined}>
                <input type="radio" name="course" className="sr-only" checked={courseId === null} onChange={() => setCourseId(null)} />
                {c.allCourses}
                <span className="gm-pick__n">{hub.total}</span>
              </label>
              {hub.courses.map((course) => (
                <label key={course.id} className="gm-pick" data-on={courseId === course.id || undefined}>
                  <input
                    type="radio"
                    name="course"
                    className="sr-only"
                    checked={courseId === course.id}
                    onChange={() => setCourseId(course.id)}
                  />
                  {course.title}
                  <span className="gm-pick__n">{course.counts.easy + course.counts.medium + course.counts.hard}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="gm-hub__group">
          <legend className="gm-hub__legend">{c.pickLevel}</legend>
          <div className="gm-levels">
            {LEVELS.map((entry) => (
              <label key={entry.level} className="gm-level" data-level={entry.level} data-on={level === entry.level || undefined}>
                <input
                  type="radio"
                  name="level"
                  className="sr-only"
                  checked={level === entry.level}
                  onChange={() => setLevel(entry.level)}
                />
                <span className="gm-level__label">{entry.label}</span>
                <span className="gm-level__n">{formatCopy(c.questionsCount, { n: counts[entry.level] })}</span>
              </label>
            ))}
          </div>
          <p className="gm-hub__hint">{c.levelHint}</p>
        </fieldset>

        <div className="gm-hub__go">
          <button
            type="button"
            className="gm-btn gm-btn--primary gm-btn--big"
            onClick={() => void start()}
            disabled={busy || available === 0}
          >
            {c.play}
            <Zap className="size-5" aria-hidden="true" />
          </button>
          <SoundToggle sound={sound} />
        </div>
        {error ? <p className="gm-error" role="alert">{c.failed}</p> : null}
      </div>
    </section>
  );
}
