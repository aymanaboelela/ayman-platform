import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { BadgesPayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { BadgesBoard } from '@/components/engagement/badges-board';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.badges;

export const metadata: Metadata = { title: c.meta.title };

/** «أوسمتي» — behind `badges`. The read records newly earned rungs, so per request. */
export default async function BadgesPage() {
  await connection();
  if (!(await featureEnabled('badges'))) notFound();
  const badges = await readOr404('/api/me/badges', BadgesPayloadSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <BadgesBoard badges={badges} />
    </main>
  );
}
