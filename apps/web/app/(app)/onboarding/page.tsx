import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { getTaxonomyLiveOrNull, getTaxonomyOrNull } from '@/lib/taxonomy';
import { accountIdentityLabel, getSession } from '@/lib/session';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { safeNext, withNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: copy.onboarding.title };

/**
 * Server component: the taxonomy (governorates, systems, tracks, elective
 * options) is read here, once, and handed down as a plain prop to the client
 * form — the form itself never talks to `/api/taxonomy`.
 *
 * cacheComponents is on (see `next.config.ts`), so this render is dynamic by
 * default; the PAGE stays that way (it reads the session), but the taxonomy
 * itself now comes from the shared `'use cache'` loader rather than a live
 * `apiGet`.
 *
 * ⚠️ That swap is not a micro-optimisation. `lib/api.ts`'s server-side
 * `apiGet` forwards no cookie, so the API's throttler falls back to the caller
 * IP — and in production that is the web container for the entire fleet, one
 * tracker key on the default 60/min budget shared by every visitor.
 * `/onboarding` runs on every fresh sign-up, and with no `error.tsx` anywhere
 * under `app/` the 429 was uncontained: a student finished registering and was
 * handed Next's bare error page as the very first screen of the product.
 * `lib/taxonomy.ts` has the full account.
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
  const [cachedTaxonomy, session, { next }] = await Promise.all([
    getTaxonomyOrNull(),
    getSession(),
    searchParams,
  ]);

  /*
    Cache first, live only if the cache is empty.

    `getTaxonomyOrNull()` caches its own failures on purpose, and a `'use cache'`
    body is evaluated during `next build` — when the API is unreachable. So a
    perfectly healthy deployment starts life with a cached `null` here, and for
    the first minute every new student would be handed <TaxonomyUnavailable>
    instead of the form. That is survivable on the three other routes that read
    this table (a missing label); it is not survivable here, because `proxy.ts`
    sends a profile-less student back to `/onboarding` from everywhere else, so
    the panel is a door with no handle.

    Playwright is what found it: CI builds and then drives a browser against
    that build, so the registration journey met the error panel on every run
    while the API was up the whole time.

    The happy path is unchanged — a cache HIT never calls this — so the
    shared-throttle-bucket problem this loader was written to solve stays
    solved. The live read costs one request only in the window where the
    alternative was a dead end.
  */
  const taxonomy = cachedTaxonomy ?? (await getTaxonomyLiveOrNull());

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

      {taxonomy === null ? (
        // `identityNote` («جبنا البيانات دي من حسابك — غيّر أي حاجة مش مظبوطة»)
        // is held back with the form it describes: it is an instruction about
        // fields that are not on the screen, and printing it over an error
        // panel is how a page starts talking to itself.
        <TaxonomyUnavailable next={next} />
      ) : (
        <>
          <p className="mb-8 text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.onboarding.identityNote}
          </p>
          {/* `next` is the last leg of a journey that may have started on a
              course page: login/register forwards it HERE rather than
              following it, because a profile is owed before any course opens.
              Validated once, on the server, like every other read of this
              parameter. */}
          <OnboardingForm
            taxonomy={taxonomy}
            account={{
              name: session.name,
              identity: accountIdentityLabel(session),
              image: session.image,
              phoneNumber: session.phoneNumber,
            }}
            next={safeNext(next)}
          />
        </>
      )}
    </main>
  );
}

/**
 * The screen a brand-new student gets when `/api/taxonomy` could not be read,
 * so there are no governorates and no years to offer.
 *
 * This is the only one of the four migrated routes where the degraded state is
 * a dead end rather than an inconvenience: `proxy.ts` sends a student with no
 * profile back here from everywhere else, so there is nothing else for them to
 * go and do. The copy therefore has to be actionable and honest about whose
 * fault it is — see `copy.onboarding.unavailable*`.
 *
 * Two details:
 *
 * - The retry is a plain `<a>`, not a `<Link>`. A `<Link>` to the URL you are
 *   already on is a soft navigation the router may answer from its own cache,
 *   so the press would visibly do nothing; a document load is what forces a
 *   fresh server render, and it also works before the JS bundle has landed —
 *   which is the state a phone on a bad connection is in when it sees this.
 * - `withNext` rather than a bare `/onboarding`, so a student who arrived here
 *   from a course link does not silently lose that destination by pressing
 *   retry. It re-validates the parameter on the way out, exactly as the form
 *   does on the way in; nothing here trusts the raw query string.
 *
 * ⚠️ `getTaxonomyOrNull()` caches its own failures — that is deliberate, and
 * `lib/taxonomy.ts` says why — so an instant retry re-reads the same cached
 * null. `cacheLife('minutes')` revalidates after 60 seconds, which is why the
 * copy says «استنى دقيقة» rather than «جرّب تاني» on its own. If that profile
 * ever changes, the wording has to change with it: a retry button that cannot
 * succeed yet is worse than no retry button.
 */
function TaxonomyUnavailable({ next }: { next: string | undefined }) {
  return (
    <div className="panel space-y-3 p-5 sm:p-6">
      <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">
        {copy.onboarding.unavailableTitle}
      </h2>
      <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
        {copy.onboarding.unavailableBody}
      </p>
      <a
        href={withNext('/onboarding', next)}
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
      >
        {copy.common.retry}
      </a>
    </div>
  );
}
