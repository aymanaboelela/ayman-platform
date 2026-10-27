import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { CardsPayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { CardsBoard } from '@/components/engagement/cards-board';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.cards;

export const metadata: Metadata = { title: c.meta.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** «بطاقات المراجعة» — behind `flashCards`. `?course=<id>` picks the deck. */
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  await connection();
  if (!(await featureEnabled('flashCards'))) notFound();
  const { course } = await searchParams;
  const query = course && UUID.test(course) ? `?courseId=${course}` : '';
  const payload = await readOr404(`/api/me/cards${query}`, CardsPayloadSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <CardsBoard initial={payload} />
    </main>
  );
}
