import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileMeSchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { SectionForm } from '@/components/settings/section-form';

const c = copy.section;

export const metadata: Metadata = { title: c.title };

/**
 * ⚠️ `getTaxonomyOrNull()`, not `apiGet('/api/taxonomy', …)`.
 *
 * The live read shared ONE server-side throttle bucket with every other route
 * in the fleet — `lib/taxonomy.ts` records why the tracker key collapses to a
 * single IP in production — and there is no `error.tsx` anywhere under `app/`
 * to contain the 429 it throws, so a busy minute replaced this settings page
 * with Next's bare error screen.
 *
 * Unlike `/library` and `/profile`, this page cannot simply drop a label on a
 * null: the year SELECT is the entire page, and its options come from the
 * taxonomy. So it renders the panel below instead of a form whose only
 * dropdown is empty — a form a student can submit, and be told by the API that
 * their answer is invalid, for a field that offered them nothing to choose.
 */
export default async function SectionSettingsPage() {
  const [taxonomy, me] = await Promise.all([
    getTaxonomyOrNull(),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
  ]);

  // `PATCH /profile/section` 404s without a profile, and the wizard is the
  // right place to make one. Sending them there beats rendering a form whose
  // only possible outcome is an error.
  if (!me.profile) redirect('/onboarding');

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 md:py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 text-fg-muted">{c.subtitle}</p>
      </header>

      {taxonomy === null ? (
        <TaxonomyUnavailable />
      ) : (
        /* Only the year is prefilled, because only the year is asked — the
           system/track/elective the profile also stores are resolved from the
           taxonomy on submit (`@/lib/section-defaults`), so there is nothing
           left here to translate from a per-environment uuid back to a slug. */
        <SectionForm taxonomy={taxonomy} currentYear={me.profile.year ?? undefined} />
      )}

      <p className="mt-8">
        <Link
          href="/library"
          className="text-[length:var(--fs-text-sm)] text-fg-muted underline-offset-4 hover:text-accent-text hover:underline"
        >
          {c.back}
        </Link>
      </p>
    </main>
  );
}

/**
 * What this page shows instead of the form when the taxonomy did not arrive.
 *
 * The retry is a plain `<a>` and not a `<Link>` on purpose. A `<Link>` to the
 * URL you are already on is a soft navigation the router can answer from its
 * own cache, so the student would press it and watch the same panel not
 * change; a document load is the only thing that guarantees a fresh server
 * render, and this is the one press on the page that has to actually do
 * something. It is also the shape that works with JS still loading, which is
 * the state a phone on a bad connection is in when it sees this.
 *
 * `min-h-11` is the 44px target the rest of the mobile pass settles on — a
 * retry the student has to aim at is a retry they press twice.
 *
 * ⚠️ `getTaxonomyOrNull()` caches its own failures on purpose (see
 * `lib/taxonomy.ts`), so an instant retry re-reads the same cached null;
 * `cacheLife('minutes')` revalidates after 60 seconds. That is why the copy
 * says «بعد شوية» rather than promising the next press will work.
 */
function TaxonomyUnavailable() {
  return (
    <div className="panel space-y-3 p-5 sm:p-6">
      <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">{c.unavailableTitle}</h2>
      <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
        {c.unavailableBody}
      </p>
      <a
        href="/settings/section"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] hover:bg-surface-3"
      >
        {copy.common.retry}
      </a>
    </div>
  );
}
