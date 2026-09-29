import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ExternalLink, type LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { GameLevel, GameMode, GameOutcome } from '@ayman/contracts/quiz/game';
import type { GamePlayerRow, GameSessionRow, GameStats } from '@ayman/contracts/quiz/game-stats';
import { Meter } from '@/components/admin/charts/stat-tile';
import { dateTime, duration, num, pct } from '@/components/admin/charts/format';

const c = copy.admin.games;

export const MODE_TITLE: Record<GameMode, string> = {
  millionaire: c.modeMillionaire,
  race: c.modeRace,
  survival: c.modeSurvival,
};
const LEVEL_TITLE: Record<GameLevel, string> = { easy: c.levelEasy, medium: c.levelMedium, hard: c.levelHard };
const LEVEL_TONE: Record<GameLevel, string> = { easy: 'var(--viz-6)', medium: 'var(--viz-1)', hard: 'var(--viz-4)' };
const OUTCOME_TITLE: Record<GameOutcome, string> = {
  won: c.outcomeWon,
  walked: c.outcomeWalked,
  lost: c.outcomeLost,
  finished: c.outcomeFinished,
};
const OUTCOME_TONE: Record<GameOutcome | 'open', string> = {
  won: 'var(--viz-3)',
  walked: 'var(--viz-2)',
  lost: 'var(--err)',
  finished: 'var(--viz-6)',
  open: 'var(--n-8)',
};

/** نقط بأرقام لاتيني معزولة جوّه الجملة العربي — زي شاشة اللعبة نفسها. */
function Score({ value }: { value: number }) {
  return <span className="font-mono tabular-nums [direction:ltr] [unicode-bidi:isolate]">{value.toLocaleString('en-US')}</span>;
}

/** كارت لعبة واحدة: جولاتها، طلبتها، وقتها، نسبة الصح، أعلى نتيجة، والمستويات. */
export function ModeCard({ row, icon: Icon, tone }: { row: GameStats['byMode'][number]; icon: LucideIcon; tone: string }) {
  const levels = (['easy', 'medium', 'hard'] as const).map((level) => ({ level, n: row.levels[level] }));
  const levelTotal = Math.max(1, levels.reduce((sum, entry) => sum + entry.n, 0));
  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-line p-4"
      style={
        {
          '--tone': tone,
          background: 'linear-gradient(160deg, color-mix(in oklab, var(--tone) 14%, var(--color-surface-2)), var(--color-surface-2) 60%)',
        } as CSSProperties
      }
    >
      <header className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-md bg-[color-mix(in_oklab,var(--tone)_22%,transparent)] text-[color:var(--tone)]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="font-semibold text-fg">{MODE_TITLE[row.mode]}</h3>
        <span className="ms-auto text-[length:var(--fs-title-3)] font-semibold text-fg">{num(row.plays)}</span>
      </header>
      <dl className="grid grid-cols-3 gap-2 text-center text-[length:var(--fs-text-xs)]">
        <div className="rounded-md bg-surface-1 p-2">
          <dt className="text-fg-muted">{c.players}</dt>
          <dd className="mt-0.5 text-[length:var(--fs-text-base)] font-semibold text-fg">{num(row.players)}</dd>
        </div>
        <div className="rounded-md bg-surface-1 p-2">
          <dt className="text-fg-muted">{c.playTime}</dt>
          <dd className="mt-0.5 text-[length:var(--fs-text-base)] font-semibold text-fg">{duration(row.seconds)}</dd>
        </div>
        <div className="rounded-md bg-surface-1 p-2">
          <dt className="text-fg-muted">{c.best}</dt>
          <dd className="mt-0.5 text-[length:var(--fs-text-base)] font-semibold text-fg">
            {row.bestScore === null ? c.noneYet : <Score value={row.bestScore} />}
          </dd>
        </div>
      </dl>
      <Meter label={c.correctRate} fraction={row.correctRate} color={tone} />
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          {levels.map((entry) => (
            <span
              key={entry.level}
              style={{ width: `${(entry.n / levelTotal) * 100}%`, background: LEVEL_TONE[entry.level] }}
            />
          ))}
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          {levels.map((entry) => (
            <li key={entry.level} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: LEVEL_TONE[entry.level] }} aria-hidden="true" />
              {LEVEL_TITLE[entry.level]} {num(entry.n)}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** أول ١٠ — كل اسم لينك لصفحة الطالب. */
export function PlayerList({
  title,
  rows,
  metric,
  tone,
}: {
  title: string;
  rows: readonly GamePlayerRow[];
  metric: 'plays' | 'seconds' | 'score';
  tone: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface-2 p-4" style={{ '--tone': tone } as CSSProperties}>
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-fg">
        <span className="size-2.5 rounded-full bg-[color:var(--tone)]" aria-hidden="true" />
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noneYet}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li key={row.userId} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-3">
              <span
                className={
                  index < 3
                    ? 'grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--tone)_28%,transparent)] text-[length:var(--fs-text-xs)] font-semibold text-fg'
                    : 'grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[length:var(--fs-text-xs)] text-fg-muted'
                }
              >
                {num(index + 1)}
              </span>
              <Link
                href={`/admin/students/${encodeURIComponent(row.userId)}`}
                className="min-w-0 flex-1 truncate text-[length:var(--fs-text-sm)] text-fg hover:underline"
              >
                {row.name || row.userId}
              </Link>
              <span className="shrink-0 text-[length:var(--fs-text-sm)] font-semibold text-fg">
                {metric === 'plays' ? (
                  num(row.plays)
                ) : metric === 'seconds' ? (
                  duration(row.seconds)
                ) : row.bestScore === null ? (
                  c.noneYet
                ) : (
                  <Score value={row.bestScore} />
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function OutcomeChip({ outcome }: { outcome: GameOutcome | null }) {
  const key = outcome ?? 'open';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-fg"
      style={{ background: `color-mix(in oklab, ${OUTCOME_TONE[key]} 22%, transparent)` }}
    >
      {outcome ? OUTCOME_TITLE[outcome] : c.outcomeOpen}
    </span>
  );
}

/** آخر الجولات: جدول على الشاشات الواسعة، وكروت على الموبايل. */
export function SessionsTable({ rows }: { rows: readonly GameSessionRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">{c.noPlays}</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-line bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/students/${encodeURIComponent(row.userId)}`}
                className="min-w-0 flex-1 truncate font-medium text-fg hover:underline"
              >
                {row.name || row.userId}
              </Link>
              <OutcomeChip outcome={row.outcome} />
            </div>
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted [overflow-wrap:anywhere]">
              {MODE_TITLE[row.mode]} · {LEVEL_TITLE[row.level]} · {row.scopeTitle ?? row.courseTitle ?? c.allCoursesRound}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-[length:var(--fs-text-xs)] text-fg">
              <span>{dateTime(row.startedAt)}</span>
              <span>{duration(row.durationSeconds)}</span>
              <span>{formatCopy(c.resultCorrect, { n: num(row.correct), total: num(row.answered) })}</span>
              <Score value={row.score} />
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
        <table className="w-full text-[length:var(--fs-text-sm)]">
          <thead className="bg-surface-2 text-start text-[length:var(--fs-text-xs)] text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{c.colStudent}</th>
              <th className="px-3 py-2 text-start font-medium">{c.colGame}</th>
              <th className="px-3 py-2 text-start font-medium">{c.colScope}</th>
              <th className="px-3 py-2 text-start font-medium">{c.colWhen}</th>
              <th className="px-3 py-2 text-start font-medium">{c.colDuration}</th>
              <th className="px-3 py-2 text-start font-medium">{c.colResult}</th>
              <th className="px-3 py-2 text-end font-medium">{c.colScore}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line-subtle hover:bg-surface-2">
                <td className="max-w-[14rem] px-3 py-2">
                  <Link href={`/admin/students/${encodeURIComponent(row.userId)}`} className="block truncate text-fg hover:underline">
                    {row.name || row.userId}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-fg">
                  {MODE_TITLE[row.mode]} <span className="text-fg-muted">· {LEVEL_TITLE[row.level]}</span>
                </td>
                <td className="max-w-[16rem] px-3 py-2 text-fg-muted">
                  <span className="block truncate">{row.scopeTitle ?? row.courseTitle ?? c.allCoursesRound}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{dateTime(row.startedAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-fg">{duration(row.durationSeconds)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="me-2 text-fg">{formatCopy(c.resultCorrect, { n: num(row.correct), total: num(row.answered) })}</span>
                  <OutcomeChip outcome={row.outcome} />
                </td>
                <td className="px-3 py-2 text-end font-semibold text-fg">
                  <Score value={row.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** أصعب الأسئلة: نص السؤال، نسبة الصح كشريط، ولينك للسؤال في البنك. */
export function HardestList({ rows }: { rows: GameStats['hardest'] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">{c.noneYet}</p>;
  }
  return (
    <ol className="grid gap-2 lg:grid-cols-2">
      {rows.map((row, index) => (
        <li key={row.questionId} className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3">
          <div className="flex items-start gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--err)_18%,transparent)] text-[length:var(--fs-text-xs)] font-semibold text-fg">
              {num(index + 1)}
            </span>
            <p className="min-w-0 flex-1 text-[length:var(--fs-text-sm)] text-fg [overflow-wrap:anywhere]">{row.stem}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(2, row.rate * 100)}%`, background: 'var(--err)' }}
              />
            </div>
            <span className="shrink-0 text-[length:var(--fs-text-sm)] font-semibold text-fg">{pct(row.rate)}</span>
            <span className="shrink-0 text-[length:var(--fs-text-xs)] text-fg-muted">
              {formatCopy(c.hardestAnswers, { n: num(row.answers) })}
            </span>
            <Link
              href={`/admin/questions/${encodeURIComponent(row.bankEntryId)}`}
              className="inline-flex shrink-0 items-center gap-1 text-[length:var(--fs-text-xs)] text-accent hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {c.editQuestion}
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
