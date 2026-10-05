'use client';

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock,
  Crown,
  GraduationCap,
  Heart,
  HeartPulse,
  Layers,
  Library,
  ListOrdered,
  Lock,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  GAME_MIN_QUESTIONS,
  GAME_RULES,
  GameRoundSchema,
  gameModeOpen,
  gameScopeCounts,
  totalOf,
  type GameHub,
  type GameHubCourse,
  type GameLevel,
  type GameMode,
  type GameMyRound,
  type GameRound,
  type GameScopeKind,
} from '@ayman/contracts/quiz/game';
import { CHALLENGE_MIN_QUESTIONS, topicCounts, type GameHubTopic } from '@ayman/contracts/quiz/challenges';
import { apiPost } from '@/lib/api';
import { Millionaire } from './millionaire';
import { Backdrop, QuizGame, SoundToggle } from './quiz-game';
import { useGameSound } from './use-game-sound';

const c = copy.game;
const NUM = new Intl.NumberFormat('en-US');

/**
 * اللي الطالب بيختاره: التلات ألعاب، و«تدريب». التدريب مش لعبة رابعة عند
 * السيرفر — جولة سباق (`race`) بـ`practice: true`: نفس عدد الأسئلة، من غير
 * تايمر ولا قلوب، والشرح بعد كل سؤال.
 */
export type HubMode = GameMode | 'practice';

const MODES: Array<{ mode: HubMode; title: string; body: string; icon: typeof Crown; tone: string }> = [
  { mode: 'millionaire', title: c.modeMillionaire, body: c.modeMillionaireBody, icon: Crown, tone: 'gold' },
  { mode: 'race', title: c.modeRace, body: c.modeRaceBody, icon: Zap, tone: 'rose' },
  { mode: 'survival', title: c.modeSurvival, body: c.modeSurvivalBody, icon: HeartPulse, tone: 'teal' },
  { mode: 'practice', title: c.modePractice, body: c.modePracticeBody, icon: GraduationCap, tone: 'violet' },
];

/** اللعبة اللي بتتبعت للسيرفر — التدريب جولة سباق. */
const playMode = (mode: HubMode): GameMode => (mode === 'practice' ? 'race' : mode);
const minFor = (mode: HubMode): number =>
  mode === 'practice' ? CHALLENGE_MIN_QUESTIONS.practice : GAME_MIN_QUESTIONS[mode];
/** الكورس فيه «تحديات» — ساعتها هي اللي بتتختار مكان «الأسئلة من». */
const topicalOf = (course: GameHubCourse | undefined): course is GameHubCourse & { topics: GameHubTopic[] } =>
  !!course && (course.topics?.length ?? 0) > 0;

const LEVELS: Array<{ level: GameLevel; label: string }> = [
  { level: 'easy', label: c.levelEasy },
  { level: 'medium', label: c.levelMedium },
  { level: 'hard', label: c.levelHard },
];

const SCOPES: Array<{ kind: GameScopeKind; label: string; icon: typeof Library }> = [
  { kind: 'all', label: c.scopeAll, icon: Library },
  { kind: 'section', label: c.scopeUnit, icon: Layers },
  { kind: 'lesson', label: c.scopeLesson, icon: BookOpen },
];

const MODE_TITLE: Record<HubMode, string> = {
  millionaire: c.modeMillionaire,
  race: c.modeRace,
  survival: c.modeSurvival,
  practice: c.modePractice,
};
const LEVEL_TITLE: Record<GameLevel, string> = { easy: c.levelEasy, medium: c.levelMedium, hard: c.levelHard };
const OUTCOME: Record<NonNullable<GameMyRound['outcome']>, string> = {
  won: c.outcomeWon,
  walked: c.outcomeWalked,
  lost: c.outcomeLost,
  finished: c.outcomeFinished,
};

/** آخر اختيار — راحة للطالب بس، فأي فشل في القراية أو الكتابة بيتبلع. */
const LAST_KEY = 'game:last:v1';

export interface GameChoice {
  mode: HubMode;
  courseId: string | null;
  scope: GameScopeKind;
  scopeId: string | null;
  level: GameLevel;
  /** «التحديات» المتعلّمة — بس لكورس فيه تحديات. */
  topicIds: string[];
}

/** النص الخام، مش الأوبجكت: `useSyncExternalStore` محتاج نفس القيمة لنفس الحالة. */
function readLastRaw(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function parseLast(raw: string | null): Partial<GameChoice> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<GameChoice>;
  } catch {
    return null;
  }
}

/** localStorage مابيبعتش إشعار لنفس التاب — الاختيار بيتقرا مرة، والتغيير من هنا. */
const noSubscribe = () => () => {};

function writeLast(choice: GameChoice): void {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(choice));
  } catch {
    /* مش مهم */
  }
}

/**
 * الاختيار المحفوظ، بعد ما يتأكد إنه لسه موجود في صفحة النهارده — كورس
 * اشتراكه خلص، أو درس اتشالت أسئلته، بيرجع للافتراضي بدل ما يبدأ على حاجة
 * مش موجودة.
 */
export function restoreChoice(hub: GameHub, saved: Partial<GameChoice> | null, fallback: GameChoice): GameChoice {
  if (!saved) return fallback;
  const mode = MODES.some((entry) => entry.mode === saved.mode) ? (saved.mode as HubMode) : fallback.mode;
  const level = LEVELS.some((entry) => entry.level === saved.level) ? (saved.level as GameLevel) : fallback.level;
  const course = saved.courseId ? hub.courses.find((candidate) => candidate.id === saved.courseId) : undefined;
  // «كل الكورسات» مالهاش معنى لو فيه كورس بتحديات — التحدّي في كورس واحد.
  const allowAll = hub.courses.length > 1 && !hub.courses.some(topicalOf);
  const courseId = course ? course.id : saved.courseId === null && allowAll ? null : fallback.courseId;
  const picked = hub.courses.find((candidate) => candidate.id === courseId);
  if (topicalOf(picked)) {
    const known = new Set(picked.topics.map((topic) => topic.id));
    const kept = (Array.isArray(saved.topicIds) ? saved.topicIds : []).filter((id) => known.has(id));
    return { mode, level, courseId, scope: 'all', scopeId: null, topicIds: kept.length > 0 ? kept : defaultTopics(picked, mode) };
  }
  let scope: GameScopeKind = 'all';
  let scopeId: string | null = null;
  if (course && saved.scope === 'section' && course.sections.some((section) => section.id === saved.scopeId)) {
    scope = 'section';
    scopeId = saved.scopeId ?? null;
  } else if (course && saved.scope === 'lesson' && course.lessons.some((lesson) => lesson.id === saved.scopeId)) {
    scope = 'lesson';
    scopeId = saved.scopeId ?? null;
  }
  return { mode, level, courseId, scope, scopeId, topicIds: [] };
}

/** أول تحدّي يكفي اللعبة، ولو مفيش فأوّل واحد — الزرار تحت بيقول ليه. */
function defaultTopics(course: GameHubCourse & { topics: GameHubTopic[] }, mode: HubMode): string[] {
  const enough = course.topics.find(
    (topic) => totalOf(topicCounts(course.topics, course.topicBuckets ?? [], [topic.id])) >= minFor(mode),
  );
  const first = enough ?? course.topics[0];
  return first ? [first.id] : [];
}

/**
 * صفحة الألعاب: اللعبة، والكورس، والأسئلة منين (المنهج كله، وحدة، ولا درس)،
 * والمستوى — وبعدين اللعبة نفسها في نفس المكان.
 *
 * كل رقم جنب اختيار هو اللي هيتلعب فعلًا: نفس الفلتر اللي السيرفر بيسحب بيه
 * (`gameScopeCounts` ← `gameItemAllowed`)، بإعدادات الكورس للعبة دي. اختيار
 * أسئلته أقل من اللي اللعبة محتاجاه (`GAME_MIN_QUESTIONS`) بيتعرض رمادي ومعاه
 * السبب — المليون من غير ١٥ سؤال مالوش سلّم.
 *
 * الصوت بيتفتح هنا (`sound.unlock()` على «يلا نبدأ»)، لأن دي آخر دوسة قبل
 * اللعبة والمتصفح مابيسمحش بصوت من غير دوسة.
 */
export function GamesHub({ hub }: { hub: GameHub }) {
  const sound = useGameSound();
  // آخر اختيار: السيرفر بيرندر الافتراضي (مايعرفش localStorage)، والمتصفح
  // بيقرا المحفوظ من غير hydration mismatch — نفس `useGameSound`.
  const saved = useSyncExternalStore(noSubscribe, readLastRaw, () => null);
  const restored = useMemo(
    () =>
      restoreChoice(hub, parseLast(saved), {
        mode: 'millionaire',
        // The first course, not «كل الكورسات»: the server puts the one the
        // student subscribed to first, and that is where a round should
        // start. «الكل» is still one tap away.
        courseId: hub.courses[0]?.id ?? null,
        scope: 'all',
        scopeId: null,
        level: 'medium',
        topicIds: topicalOf(hub.courses[0]) ? defaultTopics(hub.courses[0], 'millionaire') : [],
      }),
    [hub, saved],
  );
  /** اللي الطالب اختاره في الصفحة دي؛ `null` = لسه، فالمحفوظ هو اللي ماشي. */
  const [picked, setPicked] = useState<GameChoice | null>(null);
  const choice = picked ?? restored;
  const [round, setRound] = useState<GameRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const update = (patch: Partial<GameChoice>) => {
    const next = { ...choice, ...patch };
    writeLast(next);
    setPicked(next);
  };

  const course = choice.courseId ? hub.courses.find((candidate) => candidate.id === choice.courseId) : undefined;
  const topical = topicalOf(course) ? course : null;
  const allowAll = !hub.courses.some(topicalOf);
  const pool: GameHubCourse[] = course ? [course] : hub.courses;
  const scope = { kind: choice.scope, id: choice.scopeId ?? undefined };
  const game = playMode(choice.mode);
  /** كام سؤال للعبة دي في الاختيار ده — التحديات بتتعدّ من دروسها، والنطاق القديم بإعدادات الكورس. */
  const countFor = (mode: HubMode) =>
    topical
      ? topicCounts(topical.topics, topical.topicBuckets ?? [], choice.topicIds)
      : gameScopeCounts(pool, playMode(mode), scope);
  const counts = countFor(choice.mode);
  const available = totalOf(counts);
  const min = minFor(choice.mode);
  // إعدادات «كل لعبة بتسحب منين» للنطاق القديم بس — التحدّي هو اللي بيحدد الأسئلة.
  const closedFor = (mode: HubMode) => (course && !topical ? !gameModeOpen(course.modes[playMode(mode)]) : false);
  const closed = closedFor(choice.mode);
  const noTopic = topical !== null && choice.topicIds.length === 0;
  const step = { course: 2, scope: hub.courses.length > 1 ? 3 : 2 };
  const levelStep = step.scope + (course ? 1 : 0);

  const pickedTopics = topical ? topical.topics.filter((topic) => choice.topicIds.includes(topic.id)) : [];
  const scopeTitle = topical
    ? pickedTopics.length === 1
      ? pickedTopics[0]!.title
      : formatCopy(c.topicsMany, { n: pickedTopics.length })
    : choice.scope === 'section'
      ? (course?.sections.find((section) => section.id === choice.scopeId)?.title ?? c.scopeAll)
      : choice.scope === 'lesson'
        ? (course?.lessons.find((lesson) => lesson.id === choice.scopeId)?.title ?? c.scopeAll)
        : course
          ? course.title
          : c.allCourses;

  const fetchRound = () =>
    apiPost('/api/me/game/rounds', GameRoundSchema, {
      mode: game,
      level: choice.level,
      ...(choice.courseId ? { courseId: choice.courseId } : {}),
      scope: topical ? 'all' : choice.scope,
      ...(!topical && choice.scope !== 'all' && choice.scopeId ? { scopeId: choice.scopeId } : {}),
      ...(topical ? { topicIds: choice.topicIds } : {}),
      ...(choice.mode === 'practice' ? { practice: true } : {}),
    });

  const start = async () => {
    sound.unlock();
    setBusy(true);
    setError(false);
    try {
      const next = await fetchRound();
      if (next.questions.length === 0) setError(true);
      else setRound(next);
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
      <Millionaire key={round.questions[0]!.id} round={round} refetch={fetchRound} onExit={exit} sound={sound} voice={hub.voice} />
    ) : (
      <QuizGame key={round.questions[0]!.id} round={round} refetch={fetchRound} onExit={exit} sound={sound} />
    );
  }

  const canStart = !busy && !closed && !noTopic && available >= min;

  return (
    <section className="gm-stage gm-stage--hub">
      <Backdrop />
      <div className="gm-hub">
        {/* العنوان «الألعاب» هو الـh1 بتاع الصفحة فوق — هنا الشرح بس. */}
        <header className="gm-hub__head">
          <p className="gm-lead">{c.hubLead}</p>
        </header>

        <MyResults me={hub.me} />

        <fieldset className="gm-hub__group">
          <legend className="gm-hub__legend">
            <span className="gm-step" aria-hidden="true">
              1
            </span>
            {c.pickGame}
          </legend>
          <div className="gm-modes">
            {MODES.map((entry) => {
              const rules = GAME_RULES[playMode(entry.mode)];
              const practice = entry.mode === 'practice';
              const modeCount = totalOf(countFor(entry.mode));
              const modeClosed = closedFor(entry.mode);
              const short = modeCount < minFor(entry.mode);
              const best = practice ? null : hub.me.best[playMode(entry.mode)];
              return (
                <label
                  key={entry.mode}
                  className="gm-mode"
                  data-tone={entry.tone}
                  data-on={choice.mode === entry.mode || undefined}
                  data-short={short || modeClosed || undefined}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="sr-only"
                    checked={choice.mode === entry.mode}
                    onChange={() => update({ mode: entry.mode })}
                  />
                  <span className="gm-mode__check" aria-hidden="true">
                    <Check className="size-4" />
                  </span>
                  <span className="gm-mode__icon" aria-hidden="true">
                    <entry.icon className="size-7" />
                  </span>
                  <span className="gm-mode__title">{entry.title}</span>
                  <span className="gm-mode__body">{entry.body}</span>
                  <span className="gm-mode__rules">
                    <span className="gm-rule">
                      <ListOrdered className="size-3.5" aria-hidden="true" />
                      {formatCopy(c.ruleQuestionsShort, { n: rules.questions })}
                    </span>
                    <span className="gm-rule">
                      <Timer className="size-3.5" aria-hidden="true" />
                      {practice ? c.ruleNoTimer : formatCopy(c.ruleSecondsShort, { n: rules.seconds[choice.level] })}
                    </span>
                    <span className="gm-rule">
                      <Heart className="size-3.5" aria-hidden="true" />
                      {practice ? c.ruleNoLives : formatCopy(c.ruleLivesShort, { n: rules.lives })}
                    </span>
                  </span>
                  {modeClosed ? (
                    <span className="gm-mode__note">
                      <Lock className="size-3.5" aria-hidden="true" />
                      {c.modeClosed}
                    </span>
                  ) : short ? (
                    <span className="gm-mode__note">
                      <Lock className="size-3.5" aria-hidden="true" />
                      {formatCopy(c.needsAtLeast, { n: minFor(entry.mode) })}
                    </span>
                  ) : best !== null ? (
                    <span className="gm-mode__best">
                      <Trophy className="size-3.5" aria-hidden="true" />
                      {formatCopy(c.bestOn, { n: NUM.format(best) })}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        {hub.courses.length > 1 ? (
          <fieldset className="gm-hub__group">
            <legend className="gm-hub__legend">
              <span className="gm-step" aria-hidden="true">
                {step.course}
              </span>
              {c.pickCourse}
            </legend>
            <div className="gm-chips">
              {allowAll ? (
                <label className="gm-pick" data-on={choice.courseId === null || undefined}>
                  <input
                    type="radio"
                    name="course"
                    className="sr-only"
                    checked={choice.courseId === null}
                    onChange={() => update({ courseId: null, scope: 'all', scopeId: null, topicIds: [] })}
                  />
                  {c.allCourses}
                  <span className="gm-pick__n">{totalOf(gameScopeCounts(hub.courses, game, { kind: 'all' }))}</span>
                </label>
              ) : null}
              {hub.courses.map((entry) => (
                <label key={entry.id} className="gm-pick" data-on={choice.courseId === entry.id || undefined}>
                  <input
                    type="radio"
                    name="course"
                    className="sr-only"
                    checked={choice.courseId === entry.id}
                    onChange={() =>
                      update({
                        courseId: entry.id,
                        scope: 'all',
                        scopeId: null,
                        topicIds: topicalOf(entry) ? defaultTopics(entry, choice.mode) : [],
                      })
                    }
                  />
                  <span className="gm-pick__label">{entry.title}</span>
                  <span className="gm-pick__n">
                    {topicalOf(entry)
                      ? totalOf(topicCounts(entry.topics, entry.topicBuckets ?? [], entry.topics.map((topic) => topic.id)))
                      : totalOf(gameScopeCounts([entry], game, { kind: 'all' }))}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {topical ? (
          <TopicPicker
            course={topical}
            min={min}
            picked={choice.topicIds}
            step={step.scope}
            onChange={(topicIds) => update({ topicIds })}
          />
        ) : course ? (
          <ScopePicker
            course={course}
            mode={game}
            scope={choice.scope}
            scopeId={choice.scopeId}
            step={step.scope}
            onChange={(kind, id) => update({ scope: kind, scopeId: id })}
          />
        ) : null}

        <fieldset className="gm-hub__group">
          <legend className="gm-hub__legend">
            <span className="gm-step" aria-hidden="true">
              {levelStep}
            </span>
            {c.pickLevel}
          </legend>
          <div className="gm-levels">
            {LEVELS.map((entry) => (
              <label
                key={entry.level}
                className="gm-level"
                data-level={entry.level}
                data-on={choice.level === entry.level || undefined}
              >
                <input
                  type="radio"
                  name="level"
                  className="sr-only"
                  checked={choice.level === entry.level}
                  onChange={() => update({ level: entry.level })}
                />
                <span className="gm-level__label">{entry.label}</span>
                <span className="gm-level__n">{formatCopy(c.questionsCount, { n: counts[entry.level] })}</span>
              </label>
            ))}
          </div>
          <p className="gm-hub__hint">{c.levelHint}</p>
        </fieldset>

        <div className="gm-hub__go">
          <p className="gm-summary">
            <span className="gm-summary__text">
              {formatCopy(c.summary, {
                game: MODE_TITLE[choice.mode],
                scope: scopeTitle,
                level: LEVEL_TITLE[choice.level],
              })}
            </span>
            <span className="gm-summary__n">{formatCopy(c.summaryPool, { n: available })}</span>
          </p>
          {closed ? (
            <p className="gm-hub__warn">{c.modeClosed}</p>
          ) : noTopic ? (
            <p className="gm-hub__warn">{c.topicsPickOne}</p>
          ) : available < min ? (
            <p className="gm-hub__warn">
              {formatCopy(c.tooFewFor, { scope: scopeTitle, n: available, game: MODE_TITLE[choice.mode], min })}
            </p>
          ) : null}
          <button
            type="button"
            className="gm-btn gm-btn--primary gm-btn--big gm-go"
            onClick={() => void start()}
            disabled={!canStart}
            aria-busy={busy || undefined}
          >
            {c.play}
            <Zap className="size-5" aria-hidden="true" />
          </button>
          <SoundToggle sound={sound} />
        </div>
        {error ? (
          <p className="gm-error gm-error--inline" role="alert">
            {c.failed}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface ScopeItem {
  id: string;
  title: string;
  n: number;
  parent?: string;
}

/**
 * «الأسئلة من»: المنهج كله، وحدة، ولا درس. بيظهر بس لما كورس واحد يتختار،
 * ووحدة أو درس بيظهروا بس لو فيهم أسئلة — ورمادي لو أقل من اللي اللعبة
 * محتاجاه.
 */
function ScopePicker({
  course,
  mode,
  scope,
  scopeId,
  step,
  onChange,
}: {
  course: GameHubCourse;
  mode: GameMode;
  scope: GameScopeKind;
  scopeId: string | null;
  step: number;
  onChange: (kind: GameScopeKind, id: string | null) => void;
}) {
  const min = GAME_MIN_QUESTIONS[mode];
  const sections = useMemo<ScopeItem[]>(
    () =>
      course.sections
        .map((section) => ({
          id: section.id,
          title: section.title,
          n: totalOf(gameScopeCounts([course], mode, { kind: 'section', id: section.id })),
        }))
        .filter((section) => section.n > 0),
    [course, mode],
  );
  const lessons = useMemo<ScopeItem[]>(() => {
    const unit = new Map(course.sections.map((section) => [section.id, section.title]));
    return course.lessons
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        parent: unit.get(lesson.sectionId),
        n: totalOf(gameScopeCounts([course], mode, { kind: 'lesson', id: lesson.id })),
      }))
      .filter((lesson) => lesson.n > 0);
  }, [course, mode]);

  const pickKind = (kind: GameScopeKind) => {
    if (kind === 'all') return onChange('all', null);
    const list = kind === 'section' ? sections : lessons;
    // أول اختيار يكفي اللعبة، ولو مفيش فأوّل واحد — الزرار تحت بيقول ليه.
    const first = list.find((item) => item.n >= min) ?? list[0];
    onChange(kind, first?.id ?? null);
  };

  const items = scope === 'section' ? sections : scope === 'lesson' ? lessons : [];

  return (
    <fieldset className="gm-hub__group">
      <legend className="gm-hub__legend">
        <span className="gm-step" aria-hidden="true">
          {step}
        </span>
        {c.pickScope}
      </legend>
      <div className="gm-scopes" role="radiogroup" aria-label={c.pickScope}>
        {SCOPES.map((entry) => {
          const empty = entry.kind === 'section' ? sections.length === 0 : entry.kind === 'lesson' ? lessons.length === 0 : false;
          return (
            <button
              key={entry.kind}
              type="button"
              role="radio"
              aria-checked={scope === entry.kind}
              className="gm-scope"
              data-on={scope === entry.kind || undefined}
              disabled={empty}
              onClick={() => pickKind(entry.kind)}
            >
              <entry.icon className="size-4" aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {scope !== 'all' ? (
        items.length === 0 ? (
          <p className="gm-hub__hint">{scope === 'section' ? c.scopeNoUnits : c.scopeNoLessons}</p>
        ) : (
          <div
            className="gm-scope-list"
            role="radiogroup"
            aria-label={scope === 'section' ? c.scopeUnitPick : c.scopeLessonPick}
          >
            {items.map((item, i) => {
              const short = item.n < min;
              return (
                <label
                  key={item.id}
                  className="gm-scope-item"
                  data-on={scopeId === item.id || undefined}
                  data-short={short || undefined}
                  style={{ '--i': i } as CSSProperties}
                >
                  <input
                    type="radio"
                    name="scope-item"
                    className="sr-only"
                    checked={scopeId === item.id}
                    onChange={() => onChange(scope, item.id)}
                  />
                  <span className="gm-scope-item__text">
                    <span className="gm-scope-item__title">{item.title}</span>
                    {item.parent ? <span className="gm-scope-item__meta">{item.parent}</span> : null}
                    {short ? (
                      <span className="gm-scope-item__meta gm-scope-item__meta--warn">
                        {formatCopy(c.needsAtLeast, { n: min })}
                      </span>
                    ) : null}
                  </span>
                  <span className="gm-pick__n">{item.n}</span>
                </label>
              );
            })}
          </div>
        )
      ) : null}
    </fieldset>
  );
}

/**
 * «التحديات»: تحدّي واحد أو أكتر من الكورس، كل واحد بكام سؤال فيه. الأسئلة
 * بتتجمع من غير تكرار (`topicCounts`)، فالرقم تحت هو اللي هيتلعب. تحدّي أقل
 * من اللي اللعبة محتاجاه بيتعرض باهت ومعاه السبب — بس ينفع يتجمع مع غيره.
 */
function TopicPicker({
  course,
  min,
  picked,
  step,
  onChange,
}: {
  course: GameHubCourse & { topics: GameHubTopic[] };
  min: number;
  picked: string[];
  step: number;
  onChange: (topicIds: string[]) => void;
}) {
  const buckets = course.topicBuckets ?? [];
  const all = course.topics.map((topic) => topic.id);
  const everything = all.every((id) => picked.includes(id));
  return (
    <fieldset className="gm-hub__group">
      <legend className="gm-hub__legend">
        <span className="gm-step" aria-hidden="true">
          {step}
        </span>
        {c.pickTopics}
      </legend>
      <p className="gm-hub__hint">{c.topicsHint}</p>
      {course.topics.length > 1 ? (
        <button
          type="button"
          className="gm-scope gm-topics__all"
          aria-pressed={everything}
          data-on={everything || undefined}
          onClick={() => onChange(everything ? [] : all)}
        >
          <Check className="size-4" aria-hidden="true" />
          {c.topicsAll}
        </button>
      ) : null}
      <div className="gm-topics">
        {course.topics.map((topic, i) => {
          const n = totalOf(topicCounts(course.topics, buckets, [topic.id]));
          const on = picked.includes(topic.id);
          return (
            <label
              key={topic.id}
              className="gm-topic"
              data-on={on || undefined}
              data-short={n < min || undefined}
              style={{ '--i': i, '--tone': `var(--viz-${(i % 6) + 1})` } as CSSProperties}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onChange(on ? picked.filter((id) => id !== topic.id) : [...picked, topic.id])}
              />
              <span className="gm-topic__icon" aria-hidden="true">
                {on ? <Check className="size-4" /> : <Swords className="size-4" />}
              </span>
              <span className="gm-scope-item__text">
                <span className="gm-scope-item__title">{topic.title}</span>
                {n < min ? (
                  <span className="gm-scope-item__meta gm-scope-item__meta--warn">{formatCopy(c.needsAtLeast, { n: min })}</span>
                ) : null}
              </span>
              <span className="gm-pick__n">{n}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** «نتايجك»: كام جولة، وقت اللعب، أحسن نتيجة، وآخر ٣ جولات. */
function MyResults({ me }: { me: GameHub['me'] }) {
  const best = Math.max(0, ...[me.best.millionaire, me.best.race, me.best.survival].map((n) => n ?? 0));
  return (
    <section className="gm-me" aria-label={c.meTitle}>
      <div className="gm-me__stats">
        <p className="gm-me__stat" data-tone="violet">
          <Sparkles className="size-4" aria-hidden="true" />
          <span className="gm-me__n">{NUM.format(me.plays)}</span>
          <span className="gm-me__label">{c.mePlays}</span>
        </p>
        <p className="gm-me__stat" data-tone="teal">
          <Clock className="size-4" aria-hidden="true" />
          <span className="gm-me__n">{NUM.format(Math.round(me.seconds / 60))}</span>
          <span className="gm-me__label">{c.meMinutes}</span>
        </p>
        <p className="gm-me__stat" data-tone="gold">
          <Trophy className="size-4" aria-hidden="true" />
          <span className="gm-me__n">{NUM.format(best)}</span>
          <span className="gm-me__label">{c.meBest}</span>
        </p>
      </div>
      {me.recent.length === 0 ? (
        <p className="gm-me__none">{c.meNone}</p>
      ) : (
        <ul className="gm-me__recent" aria-label={c.recentTitle}>
          {me.recent.slice(0, 3).map((entry) => (
            <li key={entry.startedAt} className="gm-me__round" data-outcome={entry.outcome ?? 'open'}>
              <span className="gm-me__mode">{MODE_TITLE[entry.mode]}</span>
              <span className="gm-me__result">
                {entry.outcome ? OUTCOME[entry.outcome] : c.outcomeOpen}
                {' · '}
                {formatCopy(c.recentScore, { n: NUM.format(entry.score) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
