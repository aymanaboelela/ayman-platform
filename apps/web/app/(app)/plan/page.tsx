import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StudyPlanPayloadSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { PlanBoard } from '@/components/engagement/plan-board';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.plan;

export const metadata: Metadata = { title: c.meta.title };

/** «خطة المذاكرة» — behind `studyPlan`; the setup form until a date is saved. */
export default async function PlanPage() {
  if (!(await featureEnabled('studyPlan'))) notFound();
  const plan = await readOr404('/api/me/plan', StudyPlanPayloadSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <PlanBoard initial={plan} />
    </main>
  );
}
