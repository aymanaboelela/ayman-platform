import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { CourseForm } from '@/components/admin/course-form';
import { createCourseAction } from '../actions';

export const metadata = { title: copy.admin.course.new };

export default async function NewCoursePage() {
  const taxonomy = await apiGet('/api/taxonomy', TaxonomySchema);

  return (
    <>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">
        {copy.admin.course.new}
      </h1>
      <CourseForm taxonomy={taxonomy} action={createCourseAction} />
    </>
  );
}
