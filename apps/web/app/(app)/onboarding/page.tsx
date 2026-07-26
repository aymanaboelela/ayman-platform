import type { Metadata } from 'next';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';

export const metadata: Metadata = { title: copy.onboarding.title };

/**
 * Server component: the taxonomy (governorates, systems, tracks, elective
 * options) is fetched here, once, and handed down as a plain prop to the
 * client form — the form itself never talks to `/api/taxonomy`. Public
 * endpoint, so no session/cookie forwarding is needed for this fetch.
 *
 * cacheComponents is on (see `next.config.ts`), so this render is dynamic by
 * default — left that way rather than opting into `'use cache'`, matching
 * `app/dev/taxonomy/page.tsx`'s own reasoning.
 */
export default async function OnboardingPage() {
  const taxonomy = await apiGet('/api/taxonomy', TaxonomySchema);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-[length:var(--fs-title-1)] font-semibold">
        {copy.onboarding.title}
      </h1>
      <p className="mb-8 text-[length:var(--fs-text-base)] text-fg-muted">
        {copy.onboarding.subtitle}
      </p>
      <OnboardingForm taxonomy={taxonomy} />
    </main>
  );
}
