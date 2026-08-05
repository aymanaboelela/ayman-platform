import { CatalogListSchema } from '@ayman/contracts/catalog';
import { adminGet } from '@/lib/admin-api';
import type { CourseOption } from './article-form';

/**
 * The courses an article may point at.
 *
 * ⚠️ Reads the PUBLIC catalog, not the admin course list, and that is
 * deliberate: only a published course is a valid call to action. Offering a
 * draft course here would let an article ship a button that sends every reader
 * to a 404 on our own site — and the API refuses to name a draft course in the
 * public article payload anyway, so the two would silently disagree.
 */
export async function loadCourseOptions(): Promise<CourseOption[]> {
  const { courses } = await adminGet('/api/catalog/courses', CatalogListSchema);
  return courses.map((course) => ({ id: course.id, title: course.title }));
}
