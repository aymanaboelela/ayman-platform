import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
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
  // Both reads at once — the taxonomy does not depend on who is asking, so
  // making it wait for the session would add a round trip to every render.
  const [taxonomy, session] = await Promise.all([
    apiGet('/api/taxonomy', TaxonomySchema),
    getSession(),
  ]);

  // `proxy.ts`'s redirect matrix already keeps anonymous visitors off this
  // route, so this is a second line rather than the gate. It exists because
  // the form below now reads `session.name` unconditionally: without it, a
  // request that slipped past the proxy would crash on a null instead of
  // landing on the sign-in page.
  if (!session) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-[length:var(--fs-title-1)] font-semibold">
        {copy.onboarding.title}
      </h1>
      <p className="mb-6 text-[length:var(--fs-text-base)] text-fg-muted">
        {copy.onboarding.subtitle}
      </p>
      <p className="mb-8 text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.onboarding.identityNote}
      </p>
      <OnboardingForm
        taxonomy={taxonomy}
        account={{ name: session.name, email: session.email, image: session.image }}
      />
    </main>
  );
}
