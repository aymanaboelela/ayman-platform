import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RecapPayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { RecapView } from '@/components/engagement/recap-view';
import { getEntitlements } from '@/lib/entitlements';
import { getSession } from '@/lib/session';
import { shareBrand } from '@/lib/share-card/brand';
import '@/components/engagement/engagement.css';

const c = engagementCopy.recap;

export const metadata: Metadata = { title: c.meta.title };

/** «ملخص الشهر» — behind `monthlyRecap`. `?month=YYYY-MM` picks a month the API offers. */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const features = await getEntitlements();
  if (!features.monthlyRecap) notFound();
  const raw = (await searchParams).month;
  const month = typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
  const [recap, session, brand] = await Promise.all([
    readOr404(month ? `/api/me/recap?month=${month}` : '/api/me/recap', RecapPayloadSchema),
    getSession().catch(() => null),
    shareBrand(),
  ]);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <RecapView
        recap={recap}
        studentName={session?.name ?? ''}
        brand={brand}
        show={{ daily: features.dailyQuestion, notes: features.lessonNotes, badges: features.badges }}
      />
    </main>
  );
}
