import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Crown, Swords } from 'lucide-react';
import { AdminArenaSchema, type AdminArenaMatch } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { UserAvatar } from '@/components/app/user-avatar';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { dateTime, num } from '@/components/admin/charts/format';
import { adminGetOrNull } from '@/lib/admin-api';
import { GamesTabs } from '../games-tabs';

const c = arenaCopy.admin;

export const metadata: Metadata = { title: c.title };

/**
 * «ساحة التحدي» في لوحة الألعاب — آخر الماتشات وأعلى النقط. قراية بس:
 * الماتش نفسه مالوش حاجة يتعدّل فيها، والنقط بتتحسب لوحدها.
 *
 * الـAPI بيرد ٤٠٤ لو فلاج `arena.enabled` مقفول — الشاشة ساعتها مش موجودة.
 */
export default async function AdminArenaPage() {
  const data = await adminGetOrNull('/api/admin/arena', AdminArenaSchema);
  if (data === null) notFound();

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-[length:var(--fs-title-2)] font-semibold text-fg">
          <Swords className="size-6 text-[var(--viz-4)]" aria-hidden="true" />
          {c.title}
        </h1>
        <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
      </header>
      <GamesTabs active="arena" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={c.matchesToday} value={num(data.totals.matchesToday)} accent />
        <StatTile label={c.matchesWeek} value={num(data.totals.matchesWeek)} tint="var(--viz-4)" />
        <StatTile label={c.playersWeek} value={num(data.totals.playersWeek)} tint="var(--viz-2)" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-lg border border-line bg-surface-2 p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-fg">{c.recent}</h2>
          {data.recent.length === 0 ? (
            <p className="py-6 text-center text-fg-muted">{c.empty}</p>
          ) : (
            <ul className="grid gap-2">
              {data.recent.map((match) => (
                <MatchRow key={match.id} match={match} />
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-line bg-surface-2 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-fg">
            <Crown className="size-5 text-[var(--print-gold)]" aria-hidden="true" />
            {c.top}
          </h2>
          {data.top.length === 0 ? (
            <p className="py-6 text-center text-fg-muted">{c.empty}</p>
          ) : (
            <ol className="grid gap-2">
              {data.top.map((player, index) => (
                <li
                  key={`${player.name}-${index}`}
                  // `min-w-0`: من غيره السطر الـ`truncate` بيوسّع الجريد برّه الكارت.
                  className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-surface-1 px-3 py-2"
                >
                  <span className="w-5 text-center font-mono font-bold text-fg-muted">{index + 1}</span>
                  <UserAvatar name={player.name} image={player.image} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{player.name}</span>
                    <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                      {player.cohortLabel} · {formatCopy(c.wins, { n: num(player.wins) })} · {formatCopy(c.played, { n: num(player.played) })}
                    </span>
                  </span>
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--print-gold)_22%,transparent)] px-2 py-0.5 font-mono font-bold text-[var(--print-gold-deep)] [direction:ltr] [unicode-bidi:isolate]">
                    {player.points}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function MatchRow({ match }: { match: AdminArenaMatch }) {
  const tone = { completed: 'var(--viz-2)', forfeit: 'var(--viz-1)', abandoned: 'var(--n-9)', aborted: 'var(--err)' }[match.outcome];
  return (
    <li className="grid min-w-0 gap-1 rounded-md border border-line bg-surface-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 font-medium text-fg">
          <span className={match.winner === 'a' ? 'font-bold text-[var(--viz-2)]' : ''}>{match.a.name}</span>
          {/* كل رقم جنب اسم صاحبه — سترنج LTR واحد كان بيحط رقم (أ) جنب (ب). */}
          <span className="inline-flex items-center gap-1.5 font-mono text-fg-muted">
            <span>{match.a.score}</span>
            <span aria-hidden="true">—</span>
            <span>{match.b.score}</span>
          </span>
          <span className={match.winner === 'b' ? 'font-bold text-[var(--viz-2)]' : ''}>{match.b.name}</span>
          {match.winner === null && match.outcome === 'completed' ? (
            <span className="text-[length:var(--fs-text-xs)] text-fg-muted">({c.draw})</span>
          ) : null}
        </p>
        <p className="truncate text-[length:var(--fs-text-xs)] text-fg-muted">
          {[match.courseTitle, match.cohortLabel, formatCopy(c.questions, { n: num(match.questions) }), dateTime(match.startedAt)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <span
        className="justify-self-start rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-semibold sm:justify-self-end"
        style={{ background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone }}
      >
        {c.outcome[match.outcome]}
      </span>
    </li>
  );
}
