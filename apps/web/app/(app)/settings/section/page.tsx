import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileMeSchema, TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { SectionForm } from '@/components/settings/section-form';

const c = copy.section;

export const metadata: Metadata = { title: c.title };

export default async function SectionSettingsPage() {
  const [taxonomy, me] = await Promise.all([
    apiGet('/api/taxonomy', TaxonomySchema),
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

      {/* Only the year is prefilled, because only the year is asked — the
          system/track/elective the profile also stores are resolved from the
          taxonomy on submit (`@/lib/section-defaults`), so there is nothing
          left here to translate from a per-environment uuid back to a slug. */}
      <SectionForm taxonomy={taxonomy} currentYear={me.profile.year ?? undefined} />

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
