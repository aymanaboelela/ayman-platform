import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { SubjectsEditor } from './subjects-editor';

const AdminSubjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  nameAr: z.string(),
  aliases: z.array(z.string()),
});

export const metadata = { title: copy.admin.taxonomy.subjectsTitle };

/** Uncached. Delete is offered here (unlike governorates) but is REJECTED by
 *  the API with a 409 while a `SubjectOffering` still references the row. */
export default async function SubjectsPage() {
  const subjects = await adminGet('/api/admin/taxonomy/subjects', z.array(AdminSubjectSchema));

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.taxonomy.subjectsTitle}
      </h1>
      <SubjectsEditor subjects={subjects} />
    </>
  );
}
