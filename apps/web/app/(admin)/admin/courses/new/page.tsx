import { copy } from '@ayman/contracts/copy/admin';
import { getTaxonomyLiveOrNull, getTaxonomyOrNull } from '@/lib/taxonomy';
import { CourseForm } from '@/components/admin/course-form';
import { createCourseAction } from '../actions';

export const metadata = { title: copy.admin.course.new };

export default async function NewCoursePage() {
  /* Cache first, live only on a miss — the shape `/onboarding` uses, and for the
     same reason it uses it: taxonomy is load-bearing on this screen (the form's
     system / year / track selects are built from it), so a cached `null` cannot
     be shrugged off the way `/admin/students` shrugs off an empty filter.
     What the cache buys even so is the common case: a hit makes no API call at
     all, which is the whole point after a restart emptied the shared
     rate-limit bucket and the bare `apiGet` here would have thrown. See
     `lib/taxonomy.ts` and `admin/students/page.tsx`. */
  const taxonomy = (await getTaxonomyOrNull()) ?? (await getTaxonomyLiveOrNull());
  if (!taxonomy) throw new Error('GET /api/taxonomy is unavailable');

  return (
    <>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">
        {copy.admin.course.new}
      </h1>
      <CourseForm taxonomy={taxonomy} action={createCourseAction} />
    </>
  );
}
