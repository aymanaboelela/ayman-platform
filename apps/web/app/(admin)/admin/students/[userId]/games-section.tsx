import Link from 'next/link';
import { Crown, Gamepad2, HeartPulse, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { GameMode, GameOutcome } from '@ayman/contracts/quiz/game';
import { StudentGameSummarySchema } from '@ayman/contracts/quiz/game-stats';
import { dateTime, duration, num, pct } from '@/components/admin/charts/format';
import { adminGet } from '@/lib/admin-api';

const c = copy.admin.games;

const MODES: Array<{ mode: GameMode; title: string; icon: typeof Crown; tone: string }> = [
  { mode: 'millionaire', title: c.modeMillionaire, icon: Crown, tone: 'var(--viz-3)' },
  { mode: 'race', title: c.modeRace, icon: Zap, tone: 'var(--viz-4)' },
  { mode: 'survival', title: c.modeSurvival, icon: HeartPulse, tone: 'var(--viz-2)' },
];
const MODE_TITLE: Record<GameMode, string> = { millionaire: c.modeMillionaire, race: c.modeRace, survival: c.modeSurvival };
const OUTCOME: Record<GameOutcome, string> = {
  won: c.outcomeWon,
  walked: c.outcomeWalked,
  lost: c.outcomeLost,
  finished: c.outcomeFinished,
};

/**
 * «الألعاب» على صفحة الطالب: كام جولة، وقت اللعب، نسبة الصح، أعلى نتيجة في
 * كل لعبة، وآخر الجولات.
 *
 * في Suspense لوحده زي «السنتر والحضور»: قراية زيادة الفورم فوق مايستناهاش،
 * ومسموحلها تقع. 403 (من غير `analytics:read`) أو 404 (الفيتشر مقفولة على
 * الستاك) = مفيش حاجة تتقال، فمابيظهرش خالص.
 */
export async function GamesSection({ userId }: { userId: string }) {
  let summary;
  try {
    summary = await adminGet(`/api/admin/game-stats/students/${encodeURIComponent(userId)}`, StudentGameSummarySchema);
  } catch {
    // أي فشل هنا = اللوحة مابتظهرش، والصفحة شغّالة — دي إحصائيات لعب، مش
    // حاجة الأدمن فاتح الصفحة عشانها.
    return null;
  }

  return (
    <section className="rounded-lg border border-line bg-surface-2 p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid size-9 place-items-center rounded-md bg-[color-mix(in_oklab,var(--viz-5)_20%,transparent)] text-[color:var(--viz-5)]">
          <Gamepad2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-fg">{c.studentTitle}</h2>
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {summary.lastPlayedAt ? formatCopy(c.studentLast, { date: dateTime(summary.lastPlayedAt) }) : c.studentLead}
          </p>
        </div>
        <Link href="/admin/games/stats" className="text-[length:var(--fs-text-sm)] text-accent hover:underline">
          {c.studentAllStats}
        </Link>
      </header>

      {summary.plays === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.studentNone}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-[color-mix(in_oklab,var(--viz-1)_14%,transparent)] p-2">
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.plays}</dt>
              <dd className="text-[length:var(--fs-title-3)] font-semibold text-fg">{num(summary.plays)}</dd>
            </div>
            <div className="rounded-md bg-[color-mix(in_oklab,var(--viz-2)_14%,transparent)] p-2">
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.playTime}</dt>
              <dd className="text-[length:var(--fs-title-3)] font-semibold text-fg">{duration(summary.seconds)}</dd>
            </div>
            <div className="rounded-md bg-[color-mix(in_oklab,var(--viz-6)_14%,transparent)] p-2">
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.correctRate}</dt>
              <dd className="text-[length:var(--fs-title-3)] font-semibold text-fg">
                {pct(summary.answered > 0 ? summary.correct / summary.answered : null)}
              </dd>
            </div>
          </dl>

          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {MODES.map((entry) => {
              const row = summary.byMode.find((candidate) => candidate.mode === entry.mode);
              return (
                <li
                  key={entry.mode}
                  className="flex items-center gap-2 rounded-md border border-line bg-surface-1 p-2"
                  style={{ borderInlineStartColor: entry.tone, borderInlineStartWidth: 3 }}
                >
                  <entry.icon className="size-4 shrink-0" style={{ color: entry.tone }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-[length:var(--fs-text-xs)] font-medium text-fg">{entry.title}</p>
                    <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                      {num(row?.plays ?? 0)} · {c.best}{' '}
                      <span className="font-mono [direction:ltr] [unicode-bidi:isolate]">
                        {row?.bestScore === null || row?.bestScore === undefined ? '—' : row.bestScore.toLocaleString('en-US')}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <ol className="mt-3 flex flex-col divide-y divide-line-subtle">
            {summary.recent.slice(0, 5).map((round) => (
              <li key={round.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[length:var(--fs-text-xs)]">
                <span className="font-medium text-fg">{MODE_TITLE[round.mode]}</span>
                <span className="text-fg-muted">{dateTime(round.startedAt)}</span>
                <span className="text-fg-muted">{duration(round.durationSeconds)}</span>
                <span className="text-fg">{formatCopy(c.resultCorrect, { n: num(round.correct), total: num(round.answered) })}</span>
                <span className="ms-auto text-fg-muted">{round.outcome ? OUTCOME[round.outcome] : c.outcomeOpen}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
