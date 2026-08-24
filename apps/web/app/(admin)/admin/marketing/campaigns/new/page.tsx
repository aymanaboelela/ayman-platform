import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CatalogListSchema } from '@ayman/contracts/catalog';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { CampaignForm } from '../../campaign-form';

const c = copy.marketing;

export const metadata = { title: c.newCampaign };

/**
 * «حملة جديدة». Reads the PUBLIC catalog for the course filter, same as
 * `news/course-options.ts` — a course a campaign can point at should be one a
 * clicked link actually resolves to, and a draft course is not that.
 */
export default async function NewCampaignPage() {
  const { courses } = await adminGet('/api/catalog/courses', CatalogListSchema);

  return (
    <>
      <Link
        href="/admin/marketing/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.backToList}
      </Link>

      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.newCampaign}</h1>

      <CampaignForm courses={courses.map((course) => ({ id: course.id, title: course.title }))} />
    </>
  );
}
