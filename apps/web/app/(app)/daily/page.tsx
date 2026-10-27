import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { DailyPayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { DailyBoard } from '@/components/engagement/daily-board';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.daily;

export const metadata: Metadata = { title: c.meta.title };

/**
 * «سؤال اليوم» — behind `dailyQuestion`. Per request: the read DEALS the day's
 * card (it writes), so it can never be filled at build time.
 */
export default async function DailyPage() {
  await connection();
  if (!(await featureEnabled('dailyQuestion'))) notFound();
  const payload = await readOr404('/api/me/daily', DailyPayloadSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <DailyBoard initial={payload} />
    </main>
  );
}
