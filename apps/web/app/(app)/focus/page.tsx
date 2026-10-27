import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { FocusPayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { FocusBoard } from '@/components/engagement/focus-board';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.focus;

export const metadata: Metadata = { title: c.meta.title };

/** «أوضة المذاكرة» — behind `focusRoom`. Per request: the open sitting is the timer. */
export default async function FocusPage() {
  await connection();
  if (!(await featureEnabled('focusRoom'))) notFound();
  const payload = await readOr404('/api/me/focus', FocusPayloadSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <FocusBoard initial={payload} />
    </main>
  );
}
