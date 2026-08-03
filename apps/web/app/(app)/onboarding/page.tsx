import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { safeNext } from '@/lib/safe-next';

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
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // All three at once. None depends on the others: the taxonomy is the same
  // for every visitor, the session is who is asking, and `next` is where they
  // were going. Awaiting them in sequence would add two round trips to a page
  // that renders on every fresh sign-up.
  const [taxonomy, session, { next }] = await Promise.all([
    apiGet('/api/taxonomy', TaxonomySchema),
    getSession(),
    searchParams,
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
      {/* `next` is the last leg of a journey that may have started on a course
          page: login/register forwards it HERE rather than following it,
          because a profile is owed before any course opens. Validated once, on
          the server, like every other read of this parameter. */}
      <OnboardingForm
        taxonomy={taxonomy}
        account={{ name: session.name, email: session.email, image: session.image }}
        next={safeNext(next)}
      />
    </main>
  );
}
