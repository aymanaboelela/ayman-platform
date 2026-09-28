import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  CalendarCheck2,
  ClipboardCheck,
  Crown,
  Hourglass,
  Lock,
  Medal,
  NotebookPen,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  CohortRankSchema,
  RANK_LEVELS,
  RANK_POINTS,
  levelFor,
  type CohortRank,
  type RankLevelProgress,
} from '@ayman/contracts/rank';
import { StatTile } from '@/components/dashboard/stat-tile';
import { CountUp } from '@/components/rank/count-up';
import { LevelGem, RankArt } from '@/components/rank/rank-art';
import { apiGetAuthed } from '@/lib/api-server';
import '@/components/rank/rank.css';

const c = copy.rank;

export const metadata: Metadata = { title: c.title };

const NUM = new Intl.NumberFormat('en-US');

/**
 * «ترتيبي على الدفعة».
 *
 * الصفحة بتجاوب على تلات أسئلة بالترتيب ده: أنا فين؟ (الهيرو: المركز والقرص
 * والمستوى)، مين قدّامي؟ (الأوائل واللي حواليّ)، وأطلع إزاي؟ (الطريق لفوق). آخر
 * واحد هو اللي بيخلّي الصفحة تستاهل تتفتح تاني: من غيره الترتيب رقم بيتقرا
 * ويتقفل.
 *
 * الحساب كله في السيرفر (`CohortRankService`)، ومعادلة النقط في
 * `@ayman/contracts/rank` — نفس الأرقام اللي الصفحة بتشرحها هنا في «الطريق
 * لفوق»، فالشرح والحساب مايختلفوش.
 */
export default async function RankPage() {
  const data = await apiGetAuthed('/api/me/rank', CohortRankSchema);
  const level = levelFor(data.me.points);

  return (
    <main className="rk mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="mt-2 text-[length:var(--fs-title-1)] font-bold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[40rem] text-[length:var(--fs-text-base)] text-fg-muted">{c.subtitle}</p>
      </header>

      {data.cohort === null ? <NoYear /> : <Hero data={data} level={level} />}

      <section className="rk-row mt-6">
        <LevelCard level={level} points={data.me.points} />
        <AverageCard average={data.me.average} />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          icon={<Zap className="size-4" />}
          value={NUM.format(data.me.points)}
          label={c.statPoints}
          accent
        />
        <StatTile
          icon={<Target className="size-4" />}
          value={data.me.quizzes.average ?? c.noneYet}
          suffix={data.me.quizzes.average === null ? undefined : '%'}
          label={c.statQuizzes}
          note={formatCopy(c.statQuizzesHint, {
            count: data.me.quizzes.count,
            full: data.me.quizzes.fullMarks,
          })}
          hue={250}
        />
        <StatTile
          icon={<CalendarCheck2 className="size-4" />}
          value={data.me.exams.average ?? c.noneYet}
          suffix={data.me.exams.average === null ? undefined : '%'}
          label={c.statExams}
          note={formatCopy(c.statExamsHint, { count: data.me.exams.count })}
          hue={8}
        />
        <StatTile
          icon={<ClipboardCheck className="size-4" />}
          value={data.me.homework.submitted}
          suffix={data.me.homework.owed > 0 ? `/ ${data.me.homework.owed}` : undefined}
          label={c.statHomework}
          note={formatCopy(c.statHomeworkHint, { accepted: data.me.homework.accepted })}
          meterPercent={
            data.me.homework.owed > 0 ? (data.me.homework.submitted / data.me.homework.owed) * 100 : undefined
          }
          hue={148}
        />
      </section>

      {data.cohort !== null ? (
        <section className="rk-row rk-row--even mt-8">
          <Podium podium={data.podium} />
          <Ladder ladder={data.ladder} pointsToNextRank={data.pointsToNextRank} />
        </section>
      ) : null}

      <Climb data={data} />

      <LevelPath level={level} />

      <p className="rk-live">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {c.liveNote}
      </p>
    </main>
  );
}

function Hero({ data, level }: { data: CohortRank; level: RankLevelProgress }) {
  const rank = data.me.rank ?? 1;
  const top = rank <= 3 && data.me.points > 0 ? rank : undefined;

  return (
    <section className="rk-hero" data-level={level.key} data-top={top}>
      <div className="rk-hero__shapes" aria-hidden="true">
        <span className="rk-shape rk-shape--ring" />
        <span className="rk-shape rk-shape--blob" />
        <span className="rk-shape rk-shape--dot" />
        <span className="rk-shape rk-shape--tri" />
        <span className="rk-shape rk-shape--plus" />
      </div>
      {top ? (
        <div className="rk-confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      ) : null}

      <div className="rk-hero__copy">
        <span className="rk-hero__pill">
          <Trophy className="size-3.5" aria-hidden="true" />
          {data.cohort?.label ? formatCopy(c.heroPill, { cohort: data.cohort.label }) : c.heroPillPlain}
        </span>

        <p className="rk-hero__place">
          <span className="rk-hero__place-label">{c.place}</span>
          <span className="rk-hero__rank">
            <span className="rk-hero__hash">#</span>
            {/* العدّ بيبدأ من رقم ثابت فوق المركز، مش من حجم الدفعة — الحجم
                مابيوصلش للصفحة أصلًا. */}
            <CountUp from={rank + 30} to={rank} />
          </span>
          <span className="sr-only">{rank}</span>
          {top === 1 ? <Crown className="rk-hero__crown" aria-hidden="true" /> : null}
        </p>

        <div className="rk-hero__chips">
          {/* «أحسن من 100%» للأول بتتقري غلط، والشريحة اللي جنبها بتقول «المركز
              الأول» أصلًا. */}
          {data.me.betterThanPercent !== null && data.me.betterThanPercent < 100 ? (
            <span className="rk-chip">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              {formatCopy(c.betterThan, { percent: Math.round(data.me.betterThanPercent) })}
            </span>
          ) : null}
          {data.me.points === 0 ? (
            <span className="rk-chip rk-chip--glow">{c.zeroTitle}</span>
          ) : data.pointsToNextRank !== null ? (
            <span className="rk-chip rk-chip--glow">
              <Zap className="size-3.5" aria-hidden="true" />
              {formatCopy(c.nextRank, { points: NUM.format(data.pointsToNextRank) })}
            </span>
          ) : (
            <span className="rk-chip rk-chip--glow">
              <Crown className="size-3.5" aria-hidden="true" />
              {c.holdFirst}
            </span>
          )}
        </div>
        {data.me.points === 0 ? <p className="rk-hero__zero">{c.zeroBody}</p> : null}
      </div>

      <div className="rk-hero__visual">
        <RankArt level={level.key} />
        <span className="rk-hero__level">
          <LevelGem level={level.key} className="size-5" />
          {level.nameAr}
        </span>
      </div>
    </section>
  );
}

function NoYear() {
  return (
    <section className="rk-hero rk-hero--plain" data-level="bronze">
      <div className="rk-hero__copy">
        <span className="rk-hero__pill">
          <Trophy className="size-3.5" aria-hidden="true" />
          {c.heroPillPlain}
        </span>
        <h2 className="rk-hero__title">{c.noYearTitle}</h2>
        <p className="rk-hero__zero">{c.noYearBody}</p>
        <Link href="/profile" className="rk-cta mt-4">
          {c.noYearCta}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="rk-hero__visual">
        <RankArt level="bronze" />
      </div>
    </section>
  );
}

function LevelCard({ level, points }: { level: RankLevelProgress; points: number }) {
  const percent = Math.round(level.progress * 100);
  return (
    <div className="rk-card rk-level" data-level={level.key}>
      <div className="rk-level__head">
        <LevelGem level={level.key} className="rk-level__gem" />
        <div>
          <p className="rk-card__label">{c.levelTitle}</p>
          <p className="rk-level__name">{level.nameAr}</p>
        </div>
        <p className="rk-level__points">
          <CountUp to={points} />
          <span className="sr-only">{points}</span>
          <span className="rk-level__unit">{c.points}</span>
        </p>
      </div>
      <div className="rk-level__track" aria-hidden="true">
        <span className="rk-level__fill" style={{ '--rk-fill': `${percent}%` } as CSSProperties} />
      </div>
      <p className="rk-level__next">
        {level.next
          ? formatCopy(c.levelNext, { points: NUM.format(level.next.min - points), name: level.next.nameAr })
          : c.levelTop}
      </p>
    </div>
  );
}

const RING_R = 52;
const RING_LEN = 2 * Math.PI * RING_R;

function AverageCard({ average }: { average: number | null }) {
  const value = average ?? 0;
  const offset = RING_LEN * (1 - value / 100);
  return (
    <div className="rk-card rk-avg">
      <div className="rk-avg__dial">
      <svg className="rk-avg__ring" viewBox="0 0 128 128" aria-hidden="true">
        <defs>
          <linearGradient id="rk-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--viz-5)" />
            <stop offset="0.5" stopColor="var(--viz-3)" />
            <stop offset="1" stopColor="var(--viz-4)" />
          </linearGradient>
        </defs>
        <circle className="rk-avg__track" cx="64" cy="64" r={RING_R} />
        {average !== null ? (
          <circle
            className="rk-avg__arc"
            cx="64"
            cy="64"
            r={RING_R}
            strokeDasharray={RING_LEN}
            strokeDashoffset={offset}
            style={{ '--rk-ring-len': RING_LEN } as CSSProperties}
          />
        ) : null}
      </svg>
      <div className="rk-avg__center">
        <span className="rk-avg__value">
          {average === null ? c.noneYet : `${Math.round(average)}%`}
        </span>
        <span className="rk-avg__label">{c.averageLabel}</span>
      </div>
      </div>
      <p className="rk-avg__hint">{c.averageHint}</p>
    </div>
  );
}

/** «ملك سعيد» ← «م س». */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(' ');
}

function Podium({ podium }: { podium: CohortRank['podium'] }) {
  // الأول في النص، التاني على يمينه (أول ما العين تقرا في RTL)، والتالت شمال.
  const order = [podium[1], podium[0], podium[2]];
  return (
    <div className="rk-card">
      <h2 className="rk-card__title">
        <Medal className="size-5" aria-hidden="true" />
        {c.podiumTitle}
      </h2>
      {podium.length === 0 ? (
        <p className="rk-empty">{c.podiumEmpty}</p>
      ) : (
        <ol className="rk-podium">
          {order.map((row, slot) =>
            row ? (
              <li
                key={`${row.rank}-${slot}`}
                className="rk-podium__slot"
                data-place={Math.min(row.rank, 3)}
                data-me={row.isMe || undefined}
                style={{ '--d': slot } as CSSProperties}
              >
                <span className="rk-podium__avatar">
                  {row.rank === 1 ? <Crown className="rk-podium__crown" aria-hidden="true" /> : null}
                  {initials(row.name)}
                </span>
                <span className="rk-podium__name">{row.isMe ? c.ladderMe : row.name}</span>
                <span className="rk-podium__points">
                  {NUM.format(row.points)} {c.points}
                </span>
                <span className="rk-podium__pillar">
                  <span className="rk-podium__rank">{row.rank}</span>
                </span>
              </li>
            ) : (
              <li key={`empty-${slot}`} className="rk-podium__slot rk-podium__slot--empty" aria-hidden="true" />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

function Ladder({
  ladder,
  pointsToNextRank,
}: {
  ladder: CohortRank['ladder'];
  pointsToNextRank: number | null;
}) {
  const max = Math.max(1, ...ladder.map((row) => row.points));
  return (
    <div className="rk-card">
      <h2 className="rk-card__title">
        <TrendingUp className="size-5" aria-hidden="true" />
        {c.ladderTitle}
      </h2>
      <ol className="rk-ladder">
        {ladder.map((row, i) => (
          <li
            key={`${row.rank}-${i}`}
            className="rk-ladder__row"
            data-me={row.isMe || undefined}
            style={{ '--d': i } as CSSProperties}
          >
            <span className="rk-ladder__rank">#{row.rank}</span>
            <span className="rk-ladder__who">{row.isMe ? c.ladderMe : c.ladderOther}</span>
            <span className="rk-ladder__bar" aria-hidden="true">
              <span style={{ '--rk-fill': `${(row.points / max) * 100}%` } as CSSProperties} />
            </span>
            <span className="rk-ladder__points">{NUM.format(row.points)}</span>
          </li>
        ))}
      </ol>
      {pointsToNextRank !== null ? (
        <p className="rk-ladder__next">
          <Zap className="size-4" aria-hidden="true" />
          {formatCopy(c.nextRank, { points: NUM.format(pointsToNextRank) })}
        </p>
      ) : null}
    </div>
  );
}

function Climb({ data }: { data: CohortRank }) {
  const owedLeft = data.me.homework.owed - data.me.homework.submitted;
  const tips = [
    {
      key: 'homework',
      icon: NotebookPen,
      title: c.climbHomeworkTitle,
      body: formatCopy(c.climbHomeworkBody, {
        submitted: RANK_POINTS.homeworkSubmitted,
        accepted: RANK_POINTS.homeworkAcceptedMax,
      }),
      max: RANK_POINTS.homeworkSubmitted + RANK_POINTS.homeworkAcceptedMax,
      alert: owedLeft > 0 ? formatCopy(c.climbHomeworkOwed, { count: owedLeft }) : null,
    },
    {
      key: 'quiz',
      icon: Target,
      title: c.climbQuizTitle,
      body: formatCopy(c.climbQuizBody, { bonus: RANK_POINTS.quizFullMarkBonus }),
      max: 100 * RANK_POINTS.quizPerPercent + RANK_POINTS.quizFullMarkBonus,
      alert: null,
    },
    {
      key: 'exam',
      icon: CalendarCheck2,
      title: c.climbExamTitle,
      body: formatCopy(c.climbExamBody, {
        bonus: RANK_POINTS.examFullMarkBonus,
        max: 100 * RANK_POINTS.examPerPercent + RANK_POINTS.examFullMarkBonus,
      }),
      max: 100 * RANK_POINTS.examPerPercent + RANK_POINTS.examFullMarkBonus,
      alert: null,
    },
  ] as const;

  return (
    <section className="mt-8">
      <div className="rk-climb__head">
        <div>
          <h2 className="rk-section-title">
            <Sparkles className="size-5" aria-hidden="true" />
            {c.climbTitle}
          </h2>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.climbLead}</p>
        </div>
        <Link href="/path" className="rk-cta">
          {c.climbCta}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <ul className="rk-climb">
        {tips.map((tip) => (
          <li key={tip.key} className="rk-tip" data-kind={tip.key}>
            <span className="rk-tip__icon" aria-hidden="true">
              <tip.icon className="size-5" />
            </span>
            <span className="rk-tip__badge">{formatCopy(c.upTo, { points: tip.max })}</span>
            <h3 className="rk-tip__title">{tip.title}</h3>
            <p className="rk-tip__body">{tip.body}</p>
            {tip.alert ? <p className="rk-tip__alert">{tip.alert}</p> : null}
          </li>
        ))}
      </ul>

      {data.me.pendingReview > 0 ? (
        <p className="rk-pending">
          <Hourglass className="size-4" aria-hidden="true" />
          {formatCopy(c.climbPending, { count: data.me.pendingReview })}
        </p>
      ) : null}
    </section>
  );
}

function LevelPath({ level }: { level: RankLevelProgress }) {
  return (
    <section className="mt-8">
      <h2 className="rk-section-title">
        <Trophy className="size-5" aria-hidden="true" />
        {c.levelPathTitle}
      </h2>
      <ol className="rk-path">
        {RANK_LEVELS.map((entry, i) => {
          const state = i < level.index ? 'done' : i === level.index ? 'now' : 'locked';
          return (
            <li key={entry.key} className="rk-path__step" data-state={state} data-level={entry.key}>
              <span className="rk-path__gem">
                <LevelGem level={entry.key} className="size-9" />
                {state === 'locked' ? <Lock className="rk-path__lock" aria-hidden="true" /> : null}
              </span>
              <span className="rk-path__name">{entry.nameAr}</span>
              <span className="rk-path__min">
                {NUM.format(entry.min)} {c.points}
              </span>
              <span className="rk-path__state">
                {state === 'done' ? c.levelDone : state === 'now' ? c.levelNow : c.levelLocked}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
