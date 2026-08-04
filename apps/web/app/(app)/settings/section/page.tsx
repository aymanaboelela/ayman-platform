import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ProfileMeSchema,
  TaxonomySchema,
  copy,
  type StudentSection,
  type Taxonomy,
} from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { SectionForm } from '@/components/settings/section-form';

const c = copy.section;

export const metadata: Metadata = { title: c.title };

/**
 * Maps the stored profile back onto the shape the form edits.
 *
 * The profile holds `systemId` — a per-environment uuid — while the payload
 * takes `system`, a stable slug (see `onboarding.ts` for why the wire uses the
 * slug). This is the one place that translation is needed, and getting it
 * wrong would silently present the form as if no system had been chosen.
 */
function toSection(
  taxonomy: Taxonomy,
  profile: { systemId?: string | null; year?: number | null; trackId?: string | null },
): StudentSection {
  const system = taxonomy.systems.find((s) => s.id === profile.systemId);
  return {
    system: system?.slug === 'bacalorya' || system?.slug === 'thanaweya_amma' ? system.slug : undefined,
    year: profile.year ?? undefined,
    trackId: profile.trackId ?? undefined,
    // Deliberately not prefilled: the elective select only appears once a
    // بكالوريا year-2 track is chosen, and seeding it from a stale value would
    // be cleared by the form's own cascade on first render anyway.
    electiveSubjectId: undefined,
  };
}

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

      <SectionForm taxonomy={taxonomy} current={toSection(taxonomy, me.profile)} />

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
