import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { LeaguePayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { LeagueBoard } from '@/components/engagement/league-board';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.league;

export const metadata: Metadata = { title: c.meta.title };

/** «دوري الأسبوع» — behind `weeklyLeague`. Per request: the reader's own row is always fresh. */
export default async function LeaguePage() {
  await connection();
  if (!(await featureEnabled('weeklyLeague'))) notFound();
  const payload = await readOr404('/api/me/league', LeaguePayloadSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <LeagueBoard league={payload} />
    </main>
  );
}
